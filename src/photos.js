// Fotos reales (carpeta public/img). Si una foto no está, la app usa la ilustración.
// Claves: portadas (beach, explore), escenas de tours (volcano, kayak, sloth, river, reef, coffee, waterfall),
// tours específicos (tour-t4) y vehículos (sedan, van6, van15, coaster, bus).
export const photos = {
  beach: 'img/beach.jpg',
  explore: 'img/explore.jpg',
  volcano: 'img/volcano.jpg',
  kayak: 'img/kayak.jpg',
  sloth: 'img/sloth.jpg',
  river: 'img/river.jpg',
  waterfall: 'img/waterfall.jpg',
  reef: 'img/reef.jpg',
  coffee: 'img/coffee.jpg',
  'tour-t4': 'img/zipline.jpg',
  sedan: 'img/sedan.jpg',
  van6: 'img/van6.jpg',
  van15: 'img/van15.jpg',
  coaster: 'img/coaster.jpg',
  bus: 'img/bus.jpg',
  suv: 'img/suv.jpg',
  shuttle: 'img/shuttle.jpg',
  boat: 'img/boat.jpg',
};

// Copias de 640 px (public/img/sm) para tarjetas y fotos pequeñas: el navegador escoge la que necesita.
export const srcSet = (src) => (/^img\/[\w-]+\.jpg$/.test(src || '') ? `${src.replace('img/', 'img/sm/')} 640w, ${src} 1200w` : undefined);
