import { Observable } from '@reactivex/rxjs/dist/es6/Observable.js';
import '@reactivex/rxjs/dist/es6/add/observable/from.js';
import '@reactivex/rxjs/dist/es6/add/observable/fromEvent.js';
import '@reactivex/rxjs/dist/es6/add/observable/combineLatest.js';
import '@reactivex/rxjs/dist/es6/add/operator/map.js';
import '@reactivex/rxjs/dist/es6/add/operator/mergeMap.js';

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
