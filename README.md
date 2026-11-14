# Junior Astronaut Mission Trainer

A self-contained browser game split into separate HTML, CSS, and JavaScript files. It has no build step or package dependencies.

## Run locally

Open `index.html` in a modern browser. The interface and game mechanics work locally; live space-weather data requires an internet connection and falls back gracefully when unavailable.

## Files

- `index.html` — page structure and embedded hero image
- `styles.css` — visual styling and responsive layout
- `game.js` — game logic, controls, audio, and space-weather integration

## NASA API key

The public source uses NASA's `DEMO_KEY` rather than embedding a personal API key. Replace `NASA_API_KEY` in `game.js` with your own NASA key if you need higher API rate limits.
