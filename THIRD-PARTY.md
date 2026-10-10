# Third-party components

Everything the site loads is served from this repo. Nothing is fetched from a CDN at runtime.

## esptool-js

Version 0.6.1, vendored at `assets/vendor/esptool-js/bundle.js`.

Espressif's official JavaScript port of esptool. Licensed Apache 2.0, full text at
`assets/vendor/esptool-js/LICENSE`. Upstream: https://github.com/espressif/esptool-js

It is loaded with a dynamic `import()` only when someone clicks Connect, so the 218 KB never touches
a normal page view.

## Font Awesome Free icons

Version 6.4.0. The 21 icons the site uses were taken from the official SVG set and assembled into the
inline sprite at the top of each HTML page.

Icons are licensed CC BY 4.0. Upstream: https://fontawesome.com/license/free

The original page loaded the whole icon font from cdnjs, about 380 KB of webfonts plus a 100 KB
stylesheet, for those 21 glyphs. The sprite is roughly 11 KB and removes the third-party request.

## Everything else

The site has no logo, favicon or banner images. The site's HTML, CSS and JavaScript, and the contact
worker, were written for this project.
