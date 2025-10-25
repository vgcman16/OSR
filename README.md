# OSR

This repository contains the front-end scaffold for the Open Source Roguelike prototype.
The static site lives in the `public/` directory and loads the entry script from `src/main.js`.

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

## Project structure

```
public/
  index.html      # Main HTML document and layout
  styles.css      # Base styling for the game shell
src/
  main.js         # Initializes the canvas and bootstraps the game
```
