if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

const imagesPromise = fetch('images.json')
  .then(res => res.json());
const imgsPromise = imagesPromise
  .then(images =>
    images.map(url => {
      const img = new Image();
      img.src = `https://images.weserv.nl/?url=${url.replace(/^https?:\/\//, '')}`;
      img.classList.add('item');
      return img;
    })
  );
const readyPromise = new Promise(resolve =>
  document.addEventListener('DOMContentLoaded', resolve)
);
const containerPromise = readyPromise
  .then(() => document.getElementById('container'));

Promise.all([imgsPromise, containerPromise]).then(([imgs, container]) =>
  imgs.forEach(img => container.appendChild(img))
);
