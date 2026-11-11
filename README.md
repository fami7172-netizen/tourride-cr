# TourRide CR

App de reservas de traslados y tours en Costa Rica (español e inglés).

- **Clientes:** Traslados (aeropuerto, hotel u otro lugar), Explorar tours, Mis reservas con código QR, Perfil.
- **Panel del dueño:** Perfil → Panel del dueño (PIN inicial `1234`). Reservas, tours, socios y comisiones, tarifas y ajustes.

## Cómo funciona por dentro
- React + Vite. Código en `src/`, fotos en `public/img/` (lista en `src/photos.js`).
- Cada cambio en la rama `main` se publica solo en GitHub Pages (`.github/workflows/deploy.yml`).
- Etapa 1: los datos se guardan en el celular (localStorage). Etapa 2: base de datos Supabase con usuarios por rol.

## Para programadores
```
npm install
npm run dev     # verla en la compu
npm run build   # genera dist/
```
