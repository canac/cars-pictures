(function () {
  'use strict';

  let objectTypes = {
      'boolean': false,
      'function': true,
      'object': true,
      'number': false,
      'string': false,
      'undefined': false
  };
  let root = (objectTypes[typeof self] && self) || (objectTypes[typeof window] && window);
  /* tslint:disable:no-unused-variable */
  let freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports;
  let freeModule = objectTypes[typeof module] && module && !module.nodeType && module;
  let freeGlobal = objectTypes[typeof global] && global;
  if (freeGlobal && (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal)) {
      root = freeGlobal;
  }

  function isFunction(x) {
      return typeof x === 'function';
  }

  const isArray = Array.isArray || ((x) => x && typeof x.length === 'number');

  function isObject(x) {
      return x != null && typeof x === 'object';
  }

  // typeof any so that it we don't have to cast when comparing a result to the error object
  var errorObject = { e: {} };

  let tryCatchTarget;
  function tryCatcher() {
      try {
          return tryCatchTarget.apply(this, arguments);
      }
      catch (e) {
          errorObject.e = e;
          return errorObject;
      }
  }
  function tryCatch(fn) {
      tryCatchTarget = fn;
      return tryCatcher;
  }
  ;

  /**
   * An error thrown when one or more errors have occurred during the
   * `unsubscribe` of a {@link Subscription}.
   */
  class UnsubscriptionError extends Error {
      constructor(errors) {
          super();
          this.errors = errors;
          this.name = 'UnsubscriptionError';
          this.message = errors ? `${errors.length} errors occurred during unsubscription:
${errors.map((err, i) => `${i + 1}) ${err.toString()}`).join('\n')}` : '';
      }
  }

  /**
   * Represents a disposable resource, such as the execution of an Observable. A
   * Subscription has one important method, `unsubscribe`, that takes no argument
   * and just disposes the resource held by the subscription.
   *
   * Additionally, subscriptions may be grouped together through the `add()`
   * method, which will attach a child Subscription to the current Subscription.
   * When a Subscription is unsubscribed, all its children (and its grandchildren)
   * will be unsubscribed as well.
   *
   * @class Subscription
   */
  class Subscription {
      /**
       * @param {function(): void} [unsubscribe] A function describing how to
       * perform the disposal of resources when the `unsubscribe` method is called.
       */
      constructor(unsubscribe) {
          /**
           * A flag to indicate whether this Subscription has already been unsubscribed.
           * @type {boolean}
           */
          this.isUnsubscribed = false;
          if (unsubscribe) {
              this._unsubscribe = unsubscribe;
          }
      }
      /**
       * Disposes the resources held by the subscription. May, for instance, cancel
       * an ongoing Observable execution or cancel any other type of work that
       * started when the Subscription was created.
       * @return {void}
       */
      unsubscribe() {
          let hasErrors = false;
          let errors;
          if (this.isUnsubscribed) {
              return;
          }
          this.isUnsubscribed = true;
          const { _unsubscribe, _subscriptions } = this;
          this._subscriptions = null;
          if (isFunction(_unsubscribe)) {
              let trial = tryCatch(_unsubscribe).call(this);
              if (trial === errorObject) {
                  hasErrors = true;
                  (errors = errors || []).push(errorObject.e);
              }
          }
          if (isArray(_subscriptions)) {
              let index = -1;
              const len = _subscriptions.length;
              while (++index < len) {
                  const sub = _subscriptions[index];
                  if (isObject(sub)) {
                      let trial = tryCatch(sub.unsubscribe).call(sub);
                      if (trial === errorObject) {
                          hasErrors = true;
                          errors = errors || [];
                          let err = errorObject.e;
                          if (err instanceof UnsubscriptionError) {
                              errors = errors.concat(err.errors);
                          }
                          else {
                              errors.push(err);
                          }
                      }
                  }
              }
          }
          if (hasErrors) {
              throw new UnsubscriptionError(errors);
          }
      }
      /**
       * Adds a tear down to be called during the unsubscribe() of this
       * Subscription.
       *
       * If the tear down being added is a subscription that is already
       * unsubscribed, is the same reference `add` is being called on, or is
       * `Subscription.EMPTY`, it will not be added.
       *
       * If this subscription is already in an `isUnsubscribed` state, the passed
       * tear down logic will be executed immediately.
       *
       * @param {TeardownLogic} teardown The additional logic to execute on
       * teardown.
       * @return {Subscription} Returns the Subscription used or created to be
       * added to the inner subscriptions list. This Subscription can be used with
       * `remove()` to remove the passed teardown logic from the inner subscriptions
       * list.
       */
      add(teardown) {
          if (!teardown || (teardown === this) || (teardown === Subscription.EMPTY)) {
              return;
          }
          let sub = teardown;
          switch (typeof teardown) {
              case 'function':
                  sub = new Subscription(teardown);
              case 'object':
                  if (sub.isUnsubscribed || typeof sub.unsubscribe !== 'function') {
                      break;
                  }
                  else if (this.isUnsubscribed) {
                      sub.unsubscribe();
                  }
                  else {
                      (this._subscriptions || (this._subscriptions = [])).push(sub);
                  }
                  break;
              default:
                  throw new Error('Unrecognized teardown ' + teardown + ' added to Subscription.');
          }
          return sub;
      }
      /**
       * Removes a Subscription from the internal list of subscriptions that will
       * unsubscribe during the unsubscribe process of this Subscription.
       * @param {Subscription} subscription The subscription to remove.
       * @return {void}
       */
      remove(subscription) {
          // HACK: This might be redundant because of the logic in `add()`
          if (subscription == null || (subscription === this) || (subscription === Subscription.EMPTY)) {
              return;
          }
          const subscriptions = this._subscriptions;
          if (subscriptions) {
              const subscriptionIndex = subscriptions.indexOf(subscription);
              if (subscriptionIndex !== -1) {
                  subscriptions.splice(subscriptionIndex, 1);
              }
          }
      }
  }
  Subscription.EMPTY = (function (empty) {
      empty.isUnsubscribed = true;
      return empty;
  }(new Subscription()));

  const empty = {
      isUnsubscribed: true,
      next(value) { },
      error(err) { throw err; },
      complete() { }
  };

  const Symbol = root.Symbol;
  const $$rxSubscriber = (typeof Symbol === 'function' && typeof Symbol.for === 'function') ?
      Symbol.for('rxSubscriber') : '@@rxSubscriber';

  /**
   * Implements the {@link Observer} interface and extends the
   * {@link Subscription} class. While the {@link Observer} is the public API for
   * consuming the values of an {@link Observable}, all Observers get converted to
   * a Subscriber, in order to provide Subscription-like capabilities such as
   * `unsubscribe`. Subscriber is a common type in RxJS, and crucial for
   * implementing operators, but it is rarely used as a public API.
   *
   * @class Subscriber<T>
   */
  class Subscriber extends Subscription {
      /**
       * @param {Observer|function(value: T): void} [destinationOrNext] A partially
       * defined Observer or a `next` callback function.
       * @param {function(e: ?any): void} [error] The `error` callback of an
       * Observer.
       * @param {function(): void} [complete] The `complete` callback of an
       * Observer.
       */
      constructor(destinationOrNext, error, complete) {
          super();
          this.syncErrorValue = null;
          this.syncErrorThrown = false;
          this.syncErrorThrowable = false;
          this.isStopped = false;
          switch (arguments.length) {
              case 0:
                  this.destination = empty;
                  break;
              case 1:
                  if (!destinationOrNext) {
                      this.destination = empty;
                      break;
                  }
                  if (typeof destinationOrNext === 'object') {
                      if (destinationOrNext instanceof Subscriber) {
                          this.destination = destinationOrNext;
                          this.destination.add(this);
                      }
                      else {
                          this.syncErrorThrowable = true;
                          this.destination = new SafeSubscriber(this, destinationOrNext);
                      }
                      break;
                  }
              default:
                  this.syncErrorThrowable = true;
                  this.destination = new SafeSubscriber(this, destinationOrNext, error, complete);
                  break;
          }
      }
      [$$rxSubscriber]() { return this; }
      /**
       * A static factory for a Subscriber, given a (potentially partial) definition
       * of an Observer.
       * @param {function(x: ?T): void} [next] The `next` callback of an Observer.
       * @param {function(e: ?any): void} [error] The `error` callback of an
       * Observer.
       * @param {function(): void} [complete] The `complete` callback of an
       * Observer.
       * @return {Subscriber<T>} A Subscriber wrapping the (partially defined)
       * Observer represented by the given arguments.
       */
      static create(next, error, complete) {
          const subscriber = new Subscriber(next, error, complete);
          subscriber.syncErrorThrowable = false;
          return subscriber;
      }
      /**
       * The {@link Observer} callback to receive notifications of type `next` from
       * the Observable, with a value. The Observable may call this method 0 or more
       * times.
       * @param {T} [value] The `next` value.
       * @return {void}
       */
      next(value) {
          if (!this.isStopped) {
              this._next(value);
          }
      }
      /**
       * The {@link Observer} callback to receive notifications of type `error` from
       * the Observable, with an attached {@link Error}. Notifies the Observer that
       * the Observable has experienced an error condition.
       * @param {any} [err] The `error` exception.
       * @return {void}
       */
      error(err) {
          if (!this.isStopped) {
              this.isStopped = true;
              this._error(err);
          }
      }
      /**
       * The {@link Observer} callback to receive a valueless notification of type
       * `complete` from the Observable. Notifies the Observer that the Observable
       * has finished sending push-based notifications.
       * @return {void}
       */
      complete() {
          if (!this.isStopped) {
              this.isStopped = true;
              this._complete();
          }
      }
      unsubscribe() {
          if (this.isUnsubscribed) {
              return;
          }
          this.isStopped = true;
          super.unsubscribe();
      }
      _next(value) {
          this.destination.next(value);
      }
      _error(err) {
          this.destination.error(err);
          this.unsubscribe();
      }
      _complete() {
          this.destination.complete();
          this.unsubscribe();
      }
  }
  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @ignore
   * @extends {Ignored}
   */
  class SafeSubscriber extends Subscriber {
      constructor(_parent, observerOrNext, error, complete) {
          super();
          this._parent = _parent;
          let next;
          let context = this;
          if (isFunction(observerOrNext)) {
              next = observerOrNext;
          }
          else if (observerOrNext) {
              context = observerOrNext;
              next = observerOrNext.next;
              error = observerOrNext.error;
              complete = observerOrNext.complete;
              if (isFunction(context.unsubscribe)) {
                  this.add(context.unsubscribe.bind(context));
              }
              context.unsubscribe = this.unsubscribe.bind(this);
          }
          this._context = context;
          this._next = next;
          this._error = error;
          this._complete = complete;
      }
      next(value) {
          if (!this.isStopped && this._next) {
              const { _parent } = this;
              if (!_parent.syncErrorThrowable) {
                  this.__tryOrUnsub(this._next, value);
              }
              else if (this.__tryOrSetError(_parent, this._next, value)) {
                  this.unsubscribe();
              }
          }
      }
      error(err) {
          if (!this.isStopped) {
              const { _parent } = this;
              if (this._error) {
                  if (!_parent.syncErrorThrowable) {
                      this.__tryOrUnsub(this._error, err);
                      this.unsubscribe();
                  }
                  else {
                      this.__tryOrSetError(_parent, this._error, err);
                      this.unsubscribe();
                  }
              }
              else if (!_parent.syncErrorThrowable) {
                  this.unsubscribe();
                  throw err;
              }
              else {
                  _parent.syncErrorValue = err;
                  _parent.syncErrorThrown = true;
                  this.unsubscribe();
              }
          }
      }
      complete() {
          if (!this.isStopped) {
              const { _parent } = this;
              if (this._complete) {
                  if (!_parent.syncErrorThrowable) {
                      this.__tryOrUnsub(this._complete);
                      this.unsubscribe();
                  }
                  else {
                      this.__tryOrSetError(_parent, this._complete);
                      this.unsubscribe();
                  }
              }
              else {
                  this.unsubscribe();
              }
          }
      }
      __tryOrUnsub(fn, value) {
          try {
              fn.call(this._context, value);
          }
          catch (err) {
              this.unsubscribe();
              throw err;
          }
      }
      __tryOrSetError(parent, fn, value) {
          try {
              fn.call(this._context, value);
          }
          catch (err) {
              parent.syncErrorValue = err;
              parent.syncErrorThrown = true;
              return true;
          }
          return false;
      }
      _unsubscribe() {
          const { _parent } = this;
          this._context = null;
          this._parent = null;
          _parent.unsubscribe();
      }
  }

  function toSubscriber(nextOrObserver, error, complete) {
      if (nextOrObserver) {
          if (nextOrObserver instanceof Subscriber) {
              return nextOrObserver;
          }
          if (nextOrObserver[$$rxSubscriber]) {
              return nextOrObserver[$$rxSubscriber]();
          }
      }
      if (!nextOrObserver && !error && !complete) {
          return new Subscriber();
      }
      return new Subscriber(nextOrObserver, error, complete);
  }


  var $$observable = Object.freeze({

  });

  /**
   * A representation of any set of values over any amount of time. This the most basic building block
   * of RxJS.
   *
   * @class Observable<T>
   */
  class Observable {
      /**
       * @constructor
       * @param {Function} subscribe the function that is  called when the Observable is
       * initially subscribed to. This function is given a Subscriber, to which new values
       * can be `next`ed, or an `error` method can be called to raise an error, or
       * `complete` can be called to notify of a successful completion.
       */
      constructor(subscribe) {
          this._isScalar = false;
          if (subscribe) {
              this._subscribe = subscribe;
          }
      }
      /**
       * Creates a new Observable, with this Observable as the source, and the passed
       * operator defined as the new observable's operator.
       * @method lift
       * @param {Operator} operator the operator defining the operation to take on the observable
       * @return {Observable} a new observable with the Operator applied
       */
      lift(operator) {
          const observable = new Observable();
          observable.source = this;
          observable.operator = operator;
          return observable;
      }
      /**
       * Registers handlers for handling emitted values, error and completions from the observable, and
       *  executes the observable's subscriber function, which will take action to set up the underlying data stream
       * @method subscribe
       * @param {PartialObserver|Function} observerOrNext (optional) either an observer defining all functions to be called,
       *  or the first of three possible handlers, which is the handler for each value emitted from the observable.
       * @param {Function} error (optional) a handler for a terminal event resulting from an error. If no error handler is provided,
       *  the error will be thrown as unhandled
       * @param {Function} complete (optional) a handler for a terminal event resulting from successful completion.
       * @return {ISubscription} a subscription reference to the registered handlers
       */
      subscribe(observerOrNext, error, complete) {
          const { operator } = this;
          const sink = toSubscriber(observerOrNext, error, complete);
          if (operator) {
              operator.call(sink, this);
          }
          else {
              sink.add(this._subscribe(sink));
          }
          if (sink.syncErrorThrowable) {
              sink.syncErrorThrowable = false;
              if (sink.syncErrorThrown) {
                  throw sink.syncErrorValue;
              }
          }
          return sink;
      }
      /**
       * @method forEach
       * @param {Function} next a handler for each value emitted by the observable
       * @param {PromiseConstructor} [PromiseCtor] a constructor function used to instantiate the Promise
       * @return {Promise} a promise that either resolves on observable completion or
       *  rejects with the handled error
       */
      forEach(next, PromiseCtor) {
          if (!PromiseCtor) {
              if (root.Rx && root.Rx.config && root.Rx.config.Promise) {
                  PromiseCtor = root.Rx.config.Promise;
              }
              else if (root.Promise) {
                  PromiseCtor = root.Promise;
              }
          }
          if (!PromiseCtor) {
              throw new Error('no Promise impl found');
          }
          return new PromiseCtor((resolve, reject) => {
              const subscription = this.subscribe((value) => {
                  if (subscription) {
                      // if there is a subscription, then we can surmise
                      // the next handling is asynchronous. Any errors thrown
                      // need to be rejected explicitly and unsubscribe must be
                      // called manually
                      try {
                          next(value);
                      }
                      catch (err) {
                          reject(err);
                          subscription.unsubscribe();
                      }
                  }
                  else {
                      // if there is NO subscription, then we're getting a nexted
                      // value synchronously during subscription. We can just call it.
                      // If it errors, Observable's `subscribe` imple will ensure the
                      // unsubscription logic is called, then synchronously rethrow the error.
                      // After that, Promise will trap the error and send it
                      // down the rejection path.
                      next(value);
                  }
              }, reject, resolve);
          });
      }
      _subscribe(subscriber) {
          return this.source.subscribe(subscriber);
      }
      /**
       * An interop point defined by the es7-observable spec https://github.com/zenparsing/es-observable
       * @method Symbol.observable
       * @return {Observable} this instance of the observable
       */
      [$$observable]() {
          return this;
      }
  }
  // HACK: Since TypeScript inherits static properties too, we have to
  // fight against TypeScript here so Subject can have a different static create signature
  /**
   * Creates a new cold Observable by calling the Observable constructor
   * @static true
   * @owner Observable
   * @method create
   * @param {Function} subscribe? the subscriber function to be passed to the Observable constructor
   * @return {Observable} a new cold observable
   */
  Observable.create = (subscribe) => {
      return new Observable(subscribe);
  };

  function isPromise(value) {
      return value && typeof value.subscribe !== 'function' && typeof value.then === 'function';
  }

  function isScheduler(value) {
      return value && typeof value.schedule === 'function';
  }

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class PromiseObservable extends Observable {
      constructor(promise, scheduler = null) {
          super();
          this.promise = promise;
          this.scheduler = scheduler;
      }
      /**
       * Converts a Promise to an Observable.
       *
       * <span class="informal">Returns an Observable that just emits the Promise's
       * resolved value, then completes.</span>
       *
       * Converts an ES2015 Promise or a Promises/A+ spec compliant Promise to an
       * Observable. If the Promise resolves with a value, the output Observable
       * emits that resolved value as a `next`, and then completes. If the Promise
       * is rejected, then the output Observable emits the corresponding Error.
       *
       * @example <caption>Convert the Promise returned by Fetch to an Observable</caption>
       * var result = Rx.Observable.fromPromise(fetch('http://myserver.com/'));
       * result.subscribe(x => console.log(x), e => console.error(e));
       *
       * @see {@link bindCallback}
       * @see {@link from}
       *
       * @param {Promise<T>} promise The promise to be converted.
       * @param {Scheduler} [scheduler] An optional Scheduler to use for scheduling
       * the delivery of the resolved value (or the rejection).
       * @return {Observable<T>} An Observable which wraps the Promise.
       * @static true
       * @name fromPromise
       * @owner Observable
       */
      static create(promise, scheduler = null) {
          return new PromiseObservable(promise, scheduler);
      }
      _subscribe(subscriber) {
          const promise = this.promise;
          const scheduler = this.scheduler;
          if (scheduler == null) {
              if (this._isScalar) {
                  if (!subscriber.isUnsubscribed) {
                      subscriber.next(this.value);
                      subscriber.complete();
                  }
              }
              else {
                  promise.then((value) => {
                      this.value = value;
                      this._isScalar = true;
                      if (!subscriber.isUnsubscribed) {
                          subscriber.next(value);
                          subscriber.complete();
                      }
                  }, (err) => {
                      if (!subscriber.isUnsubscribed) {
                          subscriber.error(err);
                      }
                  })
                      .then(null, err => {
                      // escape the promise trap, throw unhandled errors
                      root.setTimeout(() => { throw err; });
                  });
              }
          }
          else {
              if (this._isScalar) {
                  if (!subscriber.isUnsubscribed) {
                      return scheduler.schedule(dispatchNext, 0, { value: this.value, subscriber });
                  }
              }
              else {
                  promise.then((value) => {
                      this.value = value;
                      this._isScalar = true;
                      if (!subscriber.isUnsubscribed) {
                          subscriber.add(scheduler.schedule(dispatchNext, 0, { value, subscriber }));
                      }
                  }, (err) => {
                      if (!subscriber.isUnsubscribed) {
                          subscriber.add(scheduler.schedule(dispatchError, 0, { err, subscriber }));
                      }
                  })
                      .then(null, (err) => {
                      // escape the promise trap, throw unhandled errors
                      root.setTimeout(() => { throw err; });
                  });
              }
          }
      }
  }
  function dispatchNext(arg) {
      const { value, subscriber } = arg;
      if (!subscriber.isUnsubscribed) {
          subscriber.next(value);
          subscriber.complete();
      }
  }
  function dispatchError(arg) {
      const { err, subscriber } = arg;
      if (!subscriber.isUnsubscribed) {
          subscriber.error(err);
      }
  }

  let $$iterator;
  const Symbol$1 = root.Symbol;
  if (typeof Symbol$1 === 'function') {
      if (Symbol$1.iterator) {
          $$iterator = Symbol$1.iterator;
      }
      else if (typeof Symbol$1.for === 'function') {
          $$iterator = Symbol$1.for('iterator');
      }
  }
  else {
      if (root.Set && typeof new root.Set()['@@iterator'] === 'function') {
          // Bug for mozilla version
          $$iterator = '@@iterator';
      }
      else if (root.Map) {
          // es6-shim specific logic
          let keys = Object.getOwnPropertyNames(root.Map.prototype);
          for (let i = 0; i < keys.length; ++i) {
              let key = keys[i];
              if (key !== 'entries' && key !== 'size' && root.Map.prototype[key] === root.Map.prototype['entries']) {
                  $$iterator = key;
                  break;
              }
          }
      }
      else {
          $$iterator = '@@iterator';
      }
  }

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class IteratorObservable extends Observable {
      constructor(iterator, project, thisArg, scheduler) {
          super();
          if (iterator == null) {
              throw new Error('iterator cannot be null.');
          }
          if (isObject(project)) {
              this.thisArg = project;
              this.scheduler = thisArg;
          }
          else if (isFunction(project)) {
              this.project = project;
              this.thisArg = thisArg;
              this.scheduler = scheduler;
          }
          else if (project != null) {
              throw new Error('When provided, `project` must be a function.');
          }
          this.iterator = getIterator(iterator);
      }
      static create(iterator, project, thisArg, scheduler) {
          return new IteratorObservable(iterator, project, thisArg, scheduler);
      }
      static dispatch(state) {
          const { index, hasError, thisArg, project, iterator, subscriber } = state;
          if (hasError) {
              subscriber.error(state.error);
              return;
          }
          let result = iterator.next();
          if (result.done) {
              subscriber.complete();
              return;
          }
          if (project) {
              result = tryCatch(project).call(thisArg, result.value, index);
              if (result === errorObject) {
                  state.error = errorObject.e;
                  state.hasError = true;
              }
              else {
                  subscriber.next(result);
                  state.index = index + 1;
              }
          }
          else {
              subscriber.next(result.value);
              state.index = index + 1;
          }
          if (subscriber.isUnsubscribed) {
              return;
          }
          this.schedule(state);
      }
      _subscribe(subscriber) {
          let index = 0;
          const { iterator, project, thisArg, scheduler } = this;
          if (scheduler) {
              return scheduler.schedule(IteratorObservable.dispatch, 0, {
                  index, thisArg, project, iterator, subscriber
              });
          }
          else {
              do {
                  let result = iterator.next();
                  if (result.done) {
                      subscriber.complete();
                      break;
                  }
                  else if (project) {
                      result = tryCatch(project).call(thisArg, result.value, index++);
                      if (result === errorObject) {
                          subscriber.error(errorObject.e);
                          break;
                      }
                      subscriber.next(result);
                  }
                  else {
                      subscriber.next(result.value);
                  }
                  if (subscriber.isUnsubscribed) {
                      break;
                  }
              } while (true);
          }
      }
  }
  class StringIterator {
      constructor(str, idx = 0, len = str.length) {
          this.str = str;
          this.idx = idx;
          this.len = len;
      }
      [$$iterator]() { return (this); }
      next() {
          return this.idx < this.len ? {
              done: false,
              value: this.str.charAt(this.idx++)
          } : {
              done: true,
              value: undefined
          };
      }
  }
  class ArrayIterator {
      constructor(arr, idx = 0, len = toLength(arr)) {
          this.arr = arr;
          this.idx = idx;
          this.len = len;
      }
      [$$iterator]() { return this; }
      next() {
          return this.idx < this.len ? {
              done: false,
              value: this.arr[this.idx++]
          } : {
              done: true,
              value: undefined
          };
      }
  }
  function getIterator(obj) {
      const i = obj[$$iterator];
      if (!i && typeof obj === 'string') {
          return new StringIterator(obj);
      }
      if (!i && obj.length !== undefined) {
          return new ArrayIterator(obj);
      }
      if (!i) {
          throw new TypeError('Object is not iterable');
      }
      return obj[$$iterator]();
  }
  const maxSafeInteger = Math.pow(2, 53) - 1;
  function toLength(o) {
      let len = +o.length;
      if (isNaN(len)) {
          return 0;
      }
      if (len === 0 || !numberIsFinite(len)) {
          return len;
      }
      len = sign(len) * Math.floor(Math.abs(len));
      if (len <= 0) {
          return 0;
      }
      if (len > maxSafeInteger) {
          return maxSafeInteger;
      }
      return len;
  }
  function numberIsFinite(value) {
      return typeof value === 'number' && root.isFinite(value);
  }
  function sign(value) {
      let valueAsNumber = +value;
      if (valueAsNumber === 0) {
          return valueAsNumber;
      }
      if (isNaN(valueAsNumber)) {
          return valueAsNumber;
      }
      return valueAsNumber < 0 ? -1 : 1;
  }

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class ScalarObservable extends Observable {
      constructor(value, scheduler) {
          super();
          this.value = value;
          this.scheduler = scheduler;
          this._isScalar = true;
          if (scheduler) {
              this._isScalar = false;
          }
      }
      static create(value, scheduler) {
          return new ScalarObservable(value, scheduler);
      }
      static dispatch(state) {
          const { done, value, subscriber } = state;
          if (done) {
              subscriber.complete();
              return;
          }
          subscriber.next(value);
          if (subscriber.isUnsubscribed) {
              return;
          }
          state.done = true;
          this.schedule(state);
      }
      _subscribe(subscriber) {
          const value = this.value;
          const scheduler = this.scheduler;
          if (scheduler) {
              return scheduler.schedule(ScalarObservable.dispatch, 0, {
                  done: false, value, subscriber
              });
          }
          else {
              subscriber.next(value);
              if (!subscriber.isUnsubscribed) {
                  subscriber.complete();
              }
          }
      }
  }

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class EmptyObservable extends Observable {
      constructor(scheduler) {
          super();
          this.scheduler = scheduler;
      }
      /**
       * Creates an Observable that emits no items to the Observer and immediately
       * emits a complete notification.
       *
       * <span class="informal">Just emits 'complete', and nothing else.
       * </span>
       *
       * <img src="./img/empty.png" width="100%">
       *
       * This static operator is useful for creating a simple Observable that only
       * emits the complete notification. It can be used for composing with other
       * Observables, such as in a {@link mergeMap}.
       *
       * @example <caption>Emit the number 7, then complete.</caption>
       * var result = Rx.Observable.empty().startWith(7);
       * result.subscribe(x => console.log(x));
       *
       * @example <caption>Map and flatten only odd numbers to the sequence 'a', 'b', 'c'</caption>
       * var interval = Rx.Observable.interval(1000);
       * var result = interval.mergeMap(x =>
       *   x % 2 === 1 ? Rx.Observable.of('a', 'b', 'c') : Rx.Observable.empty()
       * );
       * result.subscribe(x => console.log(x));
       *
       * @see {@link create}
       * @see {@link never}
       * @see {@link of}
       * @see {@link throw}
       *
       * @param {Scheduler} [scheduler] A {@link Scheduler} to use for scheduling
       * the emission of the complete notification.
       * @return {Observable} An "empty" Observable: emits only the complete
       * notification.
       * @static true
       * @name empty
       * @owner Observable
       */
      static create(scheduler) {
          return new EmptyObservable(scheduler);
      }
      static dispatch(arg) {
          const { subscriber } = arg;
          subscriber.complete();
      }
      _subscribe(subscriber) {
          const scheduler = this.scheduler;
          if (scheduler) {
              return scheduler.schedule(EmptyObservable.dispatch, 0, { subscriber });
          }
          else {
              subscriber.complete();
          }
      }
  }

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class ArrayObservable extends Observable {
      constructor(array, scheduler) {
          super();
          this.array = array;
          this.scheduler = scheduler;
          if (!scheduler && array.length === 1) {
              this._isScalar = true;
              this.value = array[0];
          }
      }
      static create(array, scheduler) {
          return new ArrayObservable(array, scheduler);
      }
      /**
       * Creates an Observable that emits some values you specify as arguments,
       * immediately one after the other, and then emits a complete notification.
       *
       * <span class="informal">Emits the arguments you provide, then completes.
       * </span>
       *
       * <img src="./img/of.png" width="100%">
       *
       * This static operator is useful for creating a simple Observable that only
       * emits the arguments given, and the complete notification thereafter. It can
       * be used for composing with other Observables, such as with {@link concat}.
       * By default, it uses a `null` Scheduler, which means the `next`
       * notifications are sent synchronously, although with a different Scheduler
       * it is possible to determine when those notifications will be delivered.
       *
       * @example <caption>Emit 10, 20, 30, then 'a', 'b', 'c', then start ticking every second.</caption>
       * var numbers = Rx.Observable.of(10, 20, 30);
       * var letters = Rx.Observable.of('a', 'b', 'c');
       * var interval = Rx.Observable.interval(1000);
       * var result = numbers.concat(letters).concat(interval);
       * result.subscribe(x => console.log(x));
       *
       * @see {@link create}
       * @see {@link empty}
       * @see {@link never}
       * @see {@link throw}
       *
       * @param {...T} values Arguments that represent `next` values to be emitted.
       * @param {Scheduler} [scheduler] A {@link Scheduler} to use for scheduling
       * the emissions of the `next` notifications.
       * @return {Observable<T>} An Observable that emits each given input value.
       * @static true
       * @name of
       * @owner Observable
       */
      static of(...array) {
          let scheduler = array[array.length - 1];
          if (isScheduler(scheduler)) {
              array.pop();
          }
          else {
              scheduler = null;
          }
          const len = array.length;
          if (len > 1) {
              return new ArrayObservable(array, scheduler);
          }
          else if (len === 1) {
              return new ScalarObservable(array[0], scheduler);
          }
          else {
              return new EmptyObservable(scheduler);
          }
      }
      static dispatch(state) {
          const { array, index, count, subscriber } = state;
          if (index >= count) {
              subscriber.complete();
              return;
          }
          subscriber.next(array[index]);
          if (subscriber.isUnsubscribed) {
              return;
          }
          state.index = index + 1;
          this.schedule(state);
      }
      _subscribe(subscriber) {
          let index = 0;
          const array = this.array;
          const count = array.length;
          const scheduler = this.scheduler;
          if (scheduler) {
              return scheduler.schedule(ArrayObservable.dispatch, 0, {
                  array, index, count, subscriber
              });
          }
          else {
              for (let i = 0; i < count && !subscriber.isUnsubscribed; i++) {
                  subscriber.next(array[i]);
              }
              subscriber.complete();
          }
      }
  }

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class ArrayLikeObservable extends Observable {
      constructor(arrayLike, mapFn, thisArg, scheduler) {
          super();
          this.arrayLike = arrayLike;
          this.scheduler = scheduler;
          if (!mapFn && !scheduler && arrayLike.length === 1) {
              this._isScalar = true;
              this.value = arrayLike[0];
          }
          if (mapFn) {
              this.mapFn = mapFn.bind(thisArg);
          }
      }
      static create(arrayLike, mapFn, thisArg, scheduler) {
          const length = arrayLike.length;
          if (length === 0) {
              return new EmptyObservable();
          }
          else if (length === 1 && !mapFn) {
              return new ScalarObservable(arrayLike[0], scheduler);
          }
          else {
              return new ArrayLikeObservable(arrayLike, mapFn, thisArg, scheduler);
          }
      }
      static dispatch(state) {
          const { arrayLike, index, length, mapFn, subscriber } = state;
          if (subscriber.isUnsubscribed) {
              return;
          }
          if (index >= length) {
              subscriber.complete();
              return;
          }
          const result = mapFn ? mapFn(arrayLike[index], index) : arrayLike[index];
          subscriber.next(result);
          state.index = index + 1;
          this.schedule(state);
      }
      _subscribe(subscriber) {
          let index = 0;
          const { arrayLike, mapFn, scheduler } = this;
          const length = arrayLike.length;
          if (scheduler) {
              return scheduler.schedule(ArrayLikeObservable.dispatch, 0, {
                  arrayLike, index, length, mapFn, subscriber
              });
          }
          else {
              for (let i = 0; i < length && !subscriber.isUnsubscribed; i++) {
                  const result = mapFn ? mapFn(arrayLike[i], i) : arrayLike[i];
                  subscriber.next(result);
              }
              subscriber.complete();
          }
      }
  }

  /**
   * Represents a push-based event or value that an {@link Observable} can emit.
   * This class is particularly useful for operators that manage notifications,
   * like {@link materialize}, {@link dematerialize}, {@link observeOn}, and
   * others. Besides wrapping the actual delivered value, it also annotates it
   * with metadata of, for instance, what type of push message it is (`next`,
   * `error`, or `complete`).
   *
   * @see {@link materialize}
   * @see {@link dematerialize}
   * @see {@link observeOn}
   *
   * @class Notification<T>
   */
  class Notification {
      constructor(kind, value, exception) {
          this.kind = kind;
          this.value = value;
          this.exception = exception;
          this.hasValue = kind === 'N';
      }
      /**
       * Delivers to the given `observer` the value wrapped by this Notification.
       * @param {Observer} observer
       * @return
       */
      observe(observer) {
          switch (this.kind) {
              case 'N':
                  return observer.next && observer.next(this.value);
              case 'E':
                  return observer.error && observer.error(this.exception);
              case 'C':
                  return observer.complete && observer.complete();
          }
      }
      /**
       * Given some {@link Observer} callbacks, deliver the value represented by the
       * current Notification to the correctly corresponding callback.
       * @param {function(value: T): void} next An Observer `next` callback.
       * @param {function(err: any): void} [error] An Observer `error` callback.
       * @param {function(): void} [complete] An Observer `complete` callback.
       * @return {any}
       */
      do(next, error, complete) {
          const kind = this.kind;
          switch (kind) {
              case 'N':
                  return next && next(this.value);
              case 'E':
                  return error && error(this.exception);
              case 'C':
                  return complete && complete();
          }
      }
      /**
       * Takes an Observer or its individual callback functions, and calls `observe`
       * or `do` methods accordingly.
       * @param {Observer|function(value: T): void} nextOrObserver An Observer or
       * the `next` callback.
       * @param {function(err: any): void} [error] An Observer `error` callback.
       * @param {function(): void} [complete] An Observer `complete` callback.
       * @return {any}
       */
      accept(nextOrObserver, error, complete) {
          if (nextOrObserver && typeof nextOrObserver.next === 'function') {
              return this.observe(nextOrObserver);
          }
          else {
              return this.do(nextOrObserver, error, complete);
          }
      }
      /**
       * Returns a simple Observable that just delivers the notification represented
       * by this Notification instance.
       * @return {any}
       */
      toObservable() {
          const kind = this.kind;
          switch (kind) {
              case 'N':
                  return Observable.of(this.value);
              case 'E':
                  return Observable.throw(this.exception);
              case 'C':
                  return Observable.empty();
          }
      }
      /**
       * A shortcut to create a Notification instance of the type `next` from a
       * given value.
       * @param {T} value The `next` value.
       * @return {Notification<T>} The "next" Notification representing the
       * argument.
       */
      static createNext(value) {
          if (typeof value !== 'undefined') {
              return new Notification('N', value);
          }
          return this.undefinedValueNotification;
      }
      /**
       * A shortcut to create a Notification instance of the type `error` from a
       * given error.
       * @param {any} [err] The `error` exception.
       * @return {Notification<T>} The "error" Notification representing the
       * argument.
       */
      static createError(err) {
          return new Notification('E', undefined, err);
      }
      /**
       * A shortcut to create a Notification instance of the type `complete`.
       * @return {Notification<any>} The valueless "complete" Notification.
       */
      static createComplete() {
          return this.completeNotification;
      }
  }
  Notification.completeNotification = new Notification('C');
  Notification.undefinedValueNotification = new Notification('N', undefined);

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @ignore
   * @extends {Ignored}
   */
  class ObserveOnSubscriber extends Subscriber {
      constructor(destination, scheduler, delay = 0) {
          super(destination);
          this.scheduler = scheduler;
          this.delay = delay;
      }
      static dispatch(arg) {
          const { notification, destination } = arg;
          notification.observe(destination);
      }
      scheduleMessage(notification) {
          this.add(this.scheduler.schedule(ObserveOnSubscriber.dispatch, this.delay, new ObserveOnMessage(notification, this.destination)));
      }
      _next(value) {
          this.scheduleMessage(Notification.createNext(value));
      }
      _error(err) {
          this.scheduleMessage(Notification.createError(err));
      }
      _complete() {
          this.scheduleMessage(Notification.createComplete());
      }
  }
  class ObserveOnMessage {
      constructor(notification, destination) {
          this.notification = notification;
          this.destination = destination;
      }
  }

  const isArrayLike = ((x) => x && typeof x.length === 'number');
  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class FromObservable extends Observable {
      constructor(ish, scheduler) {
          super(null);
          this.ish = ish;
          this.scheduler = scheduler;
      }
      /**
       * Creates an Observable from an Array, an array-like object, a Promise, an
       * iterable object, or an Observable-like object.
       *
       * <span class="informal">Converts almost anything to an Observable.</span>
       *
       * <img src="./img/from.png" width="100%">
       *
       * Convert various other objects and data types into Observables. `from`
       * converts a Promise or an array-like or an
       * [iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#iterable)
       * object into an Observable that emits the items in that promise or array or
       * iterable. A String, in this context, is treated as an array of characters.
       * Observable-like objects (contains a function named with the ES2015 Symbol
       * for Observable) can also be converted through this operator.
       *
       * @example <caption>Converts an array to an Observable</caption>
       * var array = [10, 20, 30];
       * var result = Rx.Observable.from(array);
       * result.subscribe(x => console.log(x));
       *
       * @example <caption>Convert an infinite iterable (from a generator) to an Observable</caption>
       * function* generateDoubles(seed) {
       *   var i = seed;
       *   while (true) {
       *     yield i;
       *     i = 2 * i; // double it
       *   }
       * }
       *
       * var iterator = generateDoubles(3);
       * var result = Rx.Observable.from(iterator).take(10);
       * result.subscribe(x => console.log(x));
       *
       * @see {@link create}
       * @see {@link fromEvent}
       * @see {@link fromEventPattern}
       * @see {@link fromPromise}
       *
       * @param {ObservableInput<T>} ish A subscribable object, a Promise, an
       * Observable-like, an Array, an iterable or an array-like object to be
       * converted.
       * @param {function(x: any, i: number): T} [mapFn] A "map" function to call
       * when converting array-like objects, where `x` is a value from the
       * array-like and `i` is the index of that value in the sequence.
       * @param {any} [thisArg] The context object to use when calling the `mapFn`,
       * if provided.
       * @param {Scheduler} [scheduler] The scheduler on which to schedule the
       * emissions of values.
       * @return {Observable<T>} The Observable whose values are originally from the
       * input object that was converted.
       * @static true
       * @name from
       * @owner Observable
       */
      static create(ish, mapFnOrScheduler, thisArg, lastScheduler) {
          let scheduler = null;
          let mapFn = null;
          if (isFunction(mapFnOrScheduler)) {
              scheduler = lastScheduler || null;
              mapFn = mapFnOrScheduler;
          }
          else if (isScheduler(scheduler)) {
              scheduler = mapFnOrScheduler;
          }
          if (ish != null) {
              if (typeof ish[$$observable] === 'function') {
                  if (ish instanceof Observable && !scheduler) {
                      return ish;
                  }
                  return new FromObservable(ish, scheduler);
              }
              else if (isArray(ish)) {
                  return new ArrayObservable(ish, scheduler);
              }
              else if (isPromise(ish)) {
                  return new PromiseObservable(ish, scheduler);
              }
              else if (typeof ish[$$iterator] === 'function' || typeof ish === 'string') {
                  return new IteratorObservable(ish, null, null, scheduler);
              }
              else if (isArrayLike(ish)) {
                  return new ArrayLikeObservable(ish, mapFn, thisArg, scheduler);
              }
          }
          throw new TypeError((ish !== null && typeof ish || ish) + ' is not observable');
      }
      _subscribe(subscriber) {
          const ish = this.ish;
          const scheduler = this.scheduler;
          if (scheduler == null) {
              return ish[$$observable]().subscribe(subscriber);
          }
          else {
              return ish[$$observable]().subscribe(new ObserveOnSubscriber(subscriber, scheduler, 0));
          }
      }
  }

  const from = FromObservable.create;

  Observable.from = from;

  function isNodeStyleEventEmmitter(sourceObj) {
      return !!sourceObj && typeof sourceObj.addListener === 'function' && typeof sourceObj.removeListener === 'function';
  }
  function isJQueryStyleEventEmitter(sourceObj) {
      return !!sourceObj && typeof sourceObj.on === 'function' && typeof sourceObj.off === 'function';
  }
  function isNodeList(sourceObj) {
      return !!sourceObj && sourceObj.toString() === '[object NodeList]';
  }
  function isHTMLCollection(sourceObj) {
      return !!sourceObj && sourceObj.toString() === '[object HTMLCollection]';
  }
  function isEventTarget(sourceObj) {
      return !!sourceObj && typeof sourceObj.addEventListener === 'function' && typeof sourceObj.removeEventListener === 'function';
  }
  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @extends {Ignored}
   * @hide true
   */
  class FromEventObservable extends Observable {
      constructor(sourceObj, eventName, selector) {
          super();
          this.sourceObj = sourceObj;
          this.eventName = eventName;
          this.selector = selector;
      }
      /**
       * Creates an Observable that emits events of a specific type coming from the
       * given event target.
       *
       * <span class="informal">Creates an Observable from DOM events, or Node
       * EventEmitter events or others.</span>
       *
       * <img src="./img/fromEvent.png" width="100%">
       *
       * Creates an Observable by attaching an event listener to an "event target",
       * which may be an object with `addEventListener` and `removeEventListener`,
       * a Node.js EventEmitter, a jQuery style EventEmitter, a NodeList from the
       * DOM, or an HTMLCollection from the DOM. The event handler is attached when
       * the output Observable is subscribed, and removed when the Subscription is
       * unsubscribed.
       *
       * @example <caption>Emits clicks happening on the DOM document</caption>
       * var clicks = Rx.Observable.fromEvent(document, 'click');
       * clicks.subscribe(x => console.log(x));
       *
       * @see {@link from}
       * @see {@link fromEventPattern}
       *
       * @param {EventTargetLike} target The DOMElement, event target, Node.js
       * EventEmitter, NodeList or HTMLCollection to attach the event handler to.
       * @param {string} eventName The event name of interest, being emitted by the
       * `target`.
       * @param {function(...args: any): T} [selector] An optional function to
       * post-process results. It takes the arguments from the event handler and
       * should return a single value.
       * @return {Observable<T>}
       * @static true
       * @name fromEvent
       * @owner Observable
       */
      static create(target, eventName, selector) {
          return new FromEventObservable(target, eventName, selector);
      }
      static setupSubscription(sourceObj, eventName, handler, subscriber) {
          let unsubscribe;
          if (isNodeList(sourceObj) || isHTMLCollection(sourceObj)) {
              for (let i = 0, len = sourceObj.length; i < len; i++) {
                  FromEventObservable.setupSubscription(sourceObj[i], eventName, handler, subscriber);
              }
          }
          else if (isEventTarget(sourceObj)) {
              sourceObj.addEventListener(eventName, handler);
              unsubscribe = () => sourceObj.removeEventListener(eventName, handler);
          }
          else if (isJQueryStyleEventEmitter(sourceObj)) {
              sourceObj.on(eventName, handler);
              unsubscribe = () => sourceObj.off(eventName, handler);
          }
          else if (isNodeStyleEventEmmitter(sourceObj)) {
              sourceObj.addListener(eventName, handler);
              unsubscribe = () => sourceObj.removeListener(eventName, handler);
          }
          subscriber.add(new Subscription(unsubscribe));
      }
      _subscribe(subscriber) {
          const sourceObj = this.sourceObj;
          const eventName = this.eventName;
          const selector = this.selector;
          let handler = selector ? (...args) => {
              let result = tryCatch(selector)(...args);
              if (result === errorObject) {
                  subscriber.error(errorObject.e);
              }
              else {
                  subscriber.next(result);
              }
          } : (e) => subscriber.next(e);
          FromEventObservable.setupSubscription(sourceObj, eventName, handler, subscriber);
      }
  }

  const fromEvent = FromEventObservable.create;

  Observable.fromEvent = fromEvent;

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @ignore
   * @extends {Ignored}
   */
  class OuterSubscriber extends Subscriber {
      notifyNext(outerValue, innerValue, outerIndex, innerIndex, innerSub) {
          this.destination.next(innerValue);
      }
      notifyError(error, innerSub) {
          this.destination.error(error);
      }
      notifyComplete(innerSub) {
          this.destination.complete();
      }
  }

  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @ignore
   * @extends {Ignored}
   */
  class InnerSubscriber extends Subscriber {
      constructor(parent, outerValue, outerIndex) {
          super();
          this.parent = parent;
          this.outerValue = outerValue;
          this.outerIndex = outerIndex;
          this.index = 0;
      }
      _next(value) {
          this.parent.notifyNext(this.outerValue, value, this.outerIndex, this.index++, this);
      }
      _error(error) {
          this.parent.notifyError(error, this);
          this.unsubscribe();
      }
      _complete() {
          this.parent.notifyComplete(this);
          this.unsubscribe();
      }
  }

  function subscribeToResult(outerSubscriber, result, outerValue, outerIndex) {
      let destination = new InnerSubscriber(outerSubscriber, outerValue, outerIndex);
      if (destination.isUnsubscribed) {
          return;
      }
      if (result instanceof Observable) {
          if (result._isScalar) {
              destination.next(result.value);
              destination.complete();
              return;
          }
          else {
              return result.subscribe(destination);
          }
      }
      if (isArray(result)) {
          for (let i = 0, len = result.length; i < len && !destination.isUnsubscribed; i++) {
              destination.next(result[i]);
          }
          if (!destination.isUnsubscribed) {
              destination.complete();
          }
      }
      else if (isPromise(result)) {
          result.then((value) => {
              if (!destination.isUnsubscribed) {
                  destination.next(value);
                  destination.complete();
              }
          }, (err) => destination.error(err))
              .then(null, (err) => {
              // Escaping the Promise trap: globally throw unhandled errors
              root.setTimeout(() => { throw err; });
          });
          return destination;
      }
      else if (typeof result[$$iterator] === 'function') {
          for (let item of result) {
              destination.next(item);
              if (destination.isUnsubscribed) {
                  break;
              }
          }
          if (!destination.isUnsubscribed) {
              destination.complete();
          }
      }
      else if (typeof result[$$observable] === 'function') {
          const obs = result[$$observable]();
          if (typeof obs.subscribe !== 'function') {
              destination.error('invalid observable');
          }
          else {
              return obs.subscribe(new InnerSubscriber(outerSubscriber, outerValue, outerIndex));
          }
      }
      else {
          destination.error(new TypeError('unknown type returned'));
      }
  }

  const none = {};
  /* tslint:enable:max-line-length */
  class CombineLatestOperator {
      constructor(project) {
          this.project = project;
      }
      call(subscriber, source) {
          return source._subscribe(new CombineLatestSubscriber(subscriber, this.project));
      }
  }
  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @ignore
   * @extends {Ignored}
   */
  class CombineLatestSubscriber extends OuterSubscriber {
      constructor(destination, project) {
          super(destination);
          this.project = project;
          this.active = 0;
          this.values = [];
          this.observables = [];
      }
      _next(observable) {
          this.values.push(none);
          this.observables.push(observable);
      }
      _complete() {
          const observables = this.observables;
          const len = observables.length;
          if (len === 0) {
              this.destination.complete();
          }
          else {
              this.active = len;
              this.toRespond = len;
              for (let i = 0; i < len; i++) {
                  const observable = observables[i];
                  this.add(subscribeToResult(this, observable, observable, i));
              }
          }
      }
      notifyComplete(unused) {
          if ((this.active -= 1) === 0) {
              this.destination.complete();
          }
      }
      notifyNext(outerValue, innerValue, outerIndex, innerIndex, innerSub) {
          const values = this.values;
          const oldVal = values[outerIndex];
          const toRespond = !this.toRespond
              ? 0
              : oldVal === none ? --this.toRespond : this.toRespond;
          values[outerIndex] = innerValue;
          if (toRespond === 0) {
              if (this.project) {
                  this._tryProject(values);
              }
              else {
                  this.destination.next(values);
              }
          }
      }
      _tryProject(values) {
          let result;
          try {
              result = this.project.apply(this, values);
          }
          catch (err) {
              this.destination.error(err);
              return;
          }
          this.destination.next(result);
      }
  }

  /* tslint:enable:max-line-length */
  /**
   * Combines multiple Observables to create an Observable whose values are
   * calculated from the latest values of each of its input Observables.
   *
   * <span class="informal">Whenever any input Observable emits a value, it
   * computes a formula using the latest values from all the inputs, then emits
   * the output of that formula.</span>
   *
   * <img src="./img/combineLatest.png" width="100%">
   *
   * `combineLatest` combines the values from all the Observables passed as
   * arguments. This is done by subscribing to each Observable, in order, and
   * collecting an array of each of the most recent values any time any of the
   * input Observables emits, then either taking that array and passing it as
   * arguments to an optional `project` function and emitting the return value of
   * that, or just emitting the array of recent values directly if there is no
   * `project` function.
   *
   * @example <caption>Dynamically calculate the Body-Mass Index from an Observable of weight and one for height</caption>
   * var weight = Rx.Observable.of(70, 72, 76, 79, 75);
   * var height = Rx.Observable.of(1.76, 1.77, 1.78);
   * var bmi = Rx.Observable.combineLatest(weight, height, (w, h) => w / (h * h));
   * bmi.subscribe(x => console.log('BMI is ' + x));
   *
   * @see {@link combineAll}
   * @see {@link merge}
   * @see {@link withLatestFrom}
   *
   * @param {Observable} observable1 An input Observable to combine with the
   * source Observable.
   * @param {Observable} observable2 An input Observable to combine with the
   * source Observable. More than one input Observables may be given as argument.
   * @param {function} [project] An optional function to project the values from
   * the combined latest values into a new value on the output Observable.
   * @param {Scheduler} [scheduler=null] The Scheduler to use for subscribing to
   * each input Observable.
   * @return {Observable} An Observable of projected values from the most recent
   * values from each input Observable, or an array of the most recent values from
   * each input Observable.
   * @static true
   * @name combineLatest
   * @owner Observable
   */
  function combineLatest(...observables) {
      let project = null;
      let scheduler = null;
      if (isScheduler(observables[observables.length - 1])) {
          scheduler = observables.pop();
      }
      if (typeof observables[observables.length - 1] === 'function') {
          project = observables.pop();
      }
      // if the first and only other argument besides the resultSelector is an array
      // assume it's been called with `combineLatest([obs1, obs2, obs3], project)`
      if (observables.length === 1 && isArray(observables[0])) {
          observables = observables[0];
      }
      return new ArrayObservable(observables, scheduler).lift(new CombineLatestOperator(project));
  }

  Observable.combineLatest = combineLatest;

  /**
   * Applies a given `project` function to each value emitted by the source
   * Observable, and emits the resulting values as an Observable.
   *
   * <span class="informal">Like [Array.prototype.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map),
   * it passes each source value through a transformation function to get
   * corresponding output values.</span>
   *
   * <img src="./img/map.png" width="100%">
   *
   * Similar to the well known `Array.prototype.map` function, this operator
   * applies a projection to each value and emits that projection in the output
   * Observable.
   *
   * @example <caption>Map every every click to the clientX position of that click</caption>
   * var clicks = Rx.Observable.fromEvent(document, 'click');
   * var positions = clicks.map(ev => ev.clientX);
   * positions.subscribe(x => console.log(x));
   *
   * @see {@link mapTo}
   * @see {@link pluck}
   *
   * @param {function(value: T, index: number): R} project The function to apply
   * to each `value` emitted by the source Observable. The `index` parameter is
   * the number `i` for the i-th emission that has happened since the
   * subscription, starting from the number `0`.
   * @param {any} [thisArg] An optional argument to define what `this` is in the
   * `project` function.
   * @return {Observable<R>} An Observable that emits the values from the source
   * Observable transformed by the given `project` function.
   * @method map
   * @owner Observable
   */
  function map(project, thisArg) {
      if (typeof project !== 'function') {
          throw new TypeError('argument is not a function. Are you looking for `mapTo()`?');
      }
      return this.lift(new MapOperator(project, thisArg));
  }
  class MapOperator {
      constructor(project, thisArg) {
          this.project = project;
          this.thisArg = thisArg;
      }
      call(subscriber, source) {
          return source._subscribe(new MapSubscriber(subscriber, this.project, this.thisArg));
      }
  }
  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @ignore
   * @extends {Ignored}
   */
  class MapSubscriber extends Subscriber {
      constructor(destination, project, thisArg) {
          super(destination);
          this.project = project;
          this.count = 0;
          this.thisArg = thisArg || this;
      }
      // NOTE: This looks unoptimized, but it's actually purposefully NOT
      // using try/catch optimizations.
      _next(value) {
          let result;
          try {
              result = this.project.call(this.thisArg, value, this.count++);
          }
          catch (err) {
              this.destination.error(err);
              return;
          }
          this.destination.next(result);
      }
  }

  Observable.prototype.map = map;

  /**
   * Projects each source value to an Observable which is merged in the output
   * Observable.
   *
   * <span class="informal">Maps each value to an Observable, then flattens all of
   * these inner Observables using {@link mergeAll}.</span>
   *
   * <img src="./img/mergeMap.png" width="100%">
   *
   * Returns an Observable that emits items based on applying a function that you
   * supply to each item emitted by the source Observable, where that function
   * returns an Observable, and then merging those resulting Observables and
   * emitting the results of this merger.
   *
   * @example <caption>Map and flatten each letter to an Observable ticking every 1 second</caption>
   * var letters = Rx.Observable.of('a', 'b', 'c');
   * var result = letters.mergeMap(x =>
   *   Rx.Observable.interval(1000).map(i => x+i)
   * );
   * result.subscribe(x => console.log(x));
   *
   * @see {@link concatMap}
   * @see {@link exhaustMap}
   * @see {@link merge}
   * @see {@link mergeAll}
   * @see {@link mergeMapTo}
   * @see {@link mergeScan}
   * @see {@link switchMap}
   *
   * @param {function(value: T, ?index: number): Observable} project A function
   * that, when applied to an item emitted by the source Observable, returns an
   * Observable.
   * @param {function(outerValue: T, innerValue: I, outerIndex: number, innerIndex: number): any} [resultSelector]
   * A function to produce the value on the output Observable based on the values
   * and the indices of the source (outer) emission and the inner Observable
   * emission. The arguments passed to this function are:
   * - `outerValue`: the value that came from the source
   * - `innerValue`: the value that came from the projected Observable
   * - `outerIndex`: the "index" of the value that came from the source
   * - `innerIndex`: the "index" of the value from the projected Observable
   * @param {number} [concurrent=Number.POSITIVE_INFINITY] Maximum number of input
   * Observables being subscribed to concurrently.
   * @return {Observable} An Observable that emits the result of applying the
   * projection function (and the optional `resultSelector`) to each item emitted
   * by the source Observable and merging the results of the Observables obtained
   * from this transformation.
   * @method mergeMap
   * @owner Observable
   */
  function mergeMap(project, resultSelector, concurrent = Number.POSITIVE_INFINITY) {
      if (typeof resultSelector === 'number') {
          concurrent = resultSelector;
          resultSelector = null;
      }
      return this.lift(new MergeMapOperator(project, resultSelector, concurrent));
  }
  class MergeMapOperator {
      constructor(project, resultSelector, concurrent = Number.POSITIVE_INFINITY) {
          this.project = project;
          this.resultSelector = resultSelector;
          this.concurrent = concurrent;
      }
      call(observer, source) {
          return source._subscribe(new MergeMapSubscriber(observer, this.project, this.resultSelector, this.concurrent));
      }
  }
  /**
   * We need this JSDoc comment for affecting ESDoc.
   * @ignore
   * @extends {Ignored}
   */
  class MergeMapSubscriber extends OuterSubscriber {
      constructor(destination, project, resultSelector, concurrent = Number.POSITIVE_INFINITY) {
          super(destination);
          this.project = project;
          this.resultSelector = resultSelector;
          this.concurrent = concurrent;
          this.hasCompleted = false;
          this.buffer = [];
          this.active = 0;
          this.index = 0;
      }
      _next(value) {
          if (this.active < this.concurrent) {
              this._tryNext(value);
          }
          else {
              this.buffer.push(value);
          }
      }
      _tryNext(value) {
          let result;
          const index = this.index++;
          try {
              result = this.project(value, index);
          }
          catch (err) {
              this.destination.error(err);
              return;
          }
          this.active++;
          this._innerSub(result, value, index);
      }
      _innerSub(ish, value, index) {
          this.add(subscribeToResult(this, ish, value, index));
      }
      _complete() {
          this.hasCompleted = true;
          if (this.active === 0 && this.buffer.length === 0) {
              this.destination.complete();
          }
      }
      notifyNext(outerValue, innerValue, outerIndex, innerIndex, innerSub) {
          if (this.resultSelector) {
              this._notifyResultSelector(outerValue, innerValue, outerIndex, innerIndex);
          }
          else {
              this.destination.next(innerValue);
          }
      }
      _notifyResultSelector(outerValue, innerValue, outerIndex, innerIndex) {
          let result;
          try {
              result = this.resultSelector(outerValue, innerValue, outerIndex, innerIndex);
          }
          catch (err) {
              this.destination.error(err);
              return;
          }
          this.destination.next(result);
      }
      notifyComplete(innerSub) {
          const buffer = this.buffer;
          this.remove(innerSub);
          this.active--;
          if (buffer.length > 0) {
              this._next(buffer.shift());
          }
          else if (this.active === 0 && this.hasCompleted) {
              this.destination.complete();
          }
      }
  }

  Observable.prototype.mergeMap = mergeMap;
  Observable.prototype.flatMap = mergeMap;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }

  const imgsObservable = Observable.from(fetch('images.json').then(res => res.json()))
    .mergeMap(images => Observable.from(images))
    .map(url => {
      const img = new Image();
      img.src = `https://images.weserv.nl/?url=${url.replace(/^https?:\/\//, '')}`;
      img.classList.add('item');
      return img;
    });
  const containerObservable = Observable.fromEvent(document, 'DOMContentLoaded')
    .map(() => document.getElementById('container'));

  Observable.combineLatest(imgsObservable, containerObservable)
    .subscribe(([img, container]) => container.appendChild(img));

}());
