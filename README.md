# OSR

This repository contains the front-end scaffold for the Open Source Roguelike prototype.
The browser entry point imports the live source modules from the `src/` directory so that
there is only a single copy of the game code.

## Running the static site locally

You can launch the site with any static file server as long as it serves the repository
root (so the browser can request files from both `public/` and `src/`). Two common options
are shown below:

### Using Node.js

```bash
npm install --global serve
serve .
```

This command serves the entire repository and makes the site available at the URL displayed
in the terminal (typically http://localhost:3000). Open `http://localhost:3000/public/` in
your browser to view the game.

### Using Python 3

```bash
python -m http.server 3000
```

Then open http://localhost:3000/public/ in your browser to view the site.

## Project structure

```
public/
  index.html      # Main HTML document and layout that imports modules from ../src/
  styles.css      # Base styling for the game shell
src/
  main.js         # Initializes the canvas and bootstraps the game
  game/
    carThief/     # Game state, systems, entities, and loop modules used by the HUD
```
