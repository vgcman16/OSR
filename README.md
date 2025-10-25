# OSR

This repository contains the front-end scaffold for the Open Source Roguelike prototype.
The static site lives entirely in the `public/` directory and loads the entry script from `public/main.js`.

## Running the static site locally

You can launch the site with any static file server. Two common options are shown below:

### Using Node.js

```bash
npm install --global serve
serve public
```

This command serves the `public/` directory and makes the site available at the URL displayed in the terminal (typically http://localhost:3000).

### Using Python 3

```bash
cd public
python -m http.server 3000
```

Then open http://localhost:3000 in your browser to view the site.

With either approach, the server must host the `public/` directory so the browser can request
`main.js` and the nested modules in `public/game/carThief/` without hitting 404s.

## Project structure

```
public/
  index.html      # Main HTML document and layout
  main.js         # Initializes the canvas and bootstraps the game
  styles.css      # Base styling for the game shell
  game/
    carThief/     # Game state, systems, entities, and loop modules used by the HUD
```
