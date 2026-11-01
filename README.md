# RA Perfumes
Extract the ZIP, then open the extracted folder in VS Code. In its terminal, run:
    
    py -m http.server 8000

On macOS or Linux use python3 instead of py. Open http://localhost:8000 in your browser. No build step is required.

## Editing
- index.html: homepage, film text, product cards and The House story.
- the-scent.html: collection and product detail markup.
- checkout.html: customer details page.
- styles.css: typography, colours, layout and mobile styling.
- app.js: product catalogue, pricing, bag, shipping checks and WhatsApp ordering. When changing prices, also update the displayed prices in the HTML.
- film.js: scroll-controlled hero video.
- assets/: images, fonts and the video.

Checkout currently runs without login. The phone login files are included but OTP is unconfigured. Google Sheets order tracking is not connected. WhatsApp opens a prepared order for the customer to send.

To host elsewhere, publish the extracted website files with index.html at the hosting root. Local edits affect only your copy until you publish them.
