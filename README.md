# Junior Astronaut Mission Trainer

A self-contained browser game split into separate HTML, CSS, and JavaScript files. It has no build step or package dependencies.

## Run locally

Open `index.html` in a modern browser. The interface and game mechanics work locally; live space-weather data requires an internet connection and falls back gracefully when unavailable.

## Files

- `index.html` — page structure and embedded hero image
- `styles.css` — visual styling and responsive layout
- `game.js` — game logic, controls, audio, and space-weather integration

## Live space-weather feed

The game reads solar-flare, CME, and notification data from CCMC's public DONKI API. It refreshes on startup and every 10 minutes. It does not require a NASA API key; if all requests fail, the game shows a clear offline status and retries after one minute.
