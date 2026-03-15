# Trénink log

Jednoduchá mobilní webová appka pro logování tréninků po dnech.
Data se ukládají do `localStorage`, takže pro GitHub Pages není potřeba backend.

## Struktura

- `index.html` – kostra aplikace
- `styles.css` – vzhled a responzivita
- `app.js` – logika aplikace, práce s daty a render

## Nasazení na GitHub Pages

1. Vytvoř nový repozitář na GitHubu.
2. Nahraj do rootu tyto soubory: `index.html`, `styles.css`, `app.js`.
3. V GitHubu otevři **Settings → Pages**.
4. V části **Build and deployment** nastav:
   - **Source**: Deploy from a branch
   - **Branch**: `main` a složka `/root`
5. Ulož a počkej, až GitHub Pages vygeneruje veřejnou URL.

## Poznámky

- Veškerá data jsou lokálně v prohlížeči.
- Pro přenos mezi zařízeními použij Export/Import JSON.
- Když budeš chtít další krok, můžeme appku rozdělit ještě víc, třeba na `data.js`, `ui.js`, `helpers.js`.
