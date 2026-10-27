# CLAUDE.md — Agora IA

## Le projet en bref

Agora IA est un site statique qui sert de support à une séance de débat entre ingénieurs logiciel utilisateurs d'IA générative (novembre 2026). Il porte sur les risques, l'éthique et les choix de société liés à l'IA et à l'AGI. Le site présente un « univers » 3D : 12 thématiques (planètes) autour d'une question centrale, « Survie et contrôle : qui garde la main sur l'IA ? ». On y trouve aussi des courants de pensée, des sources primaires avec citations vérifiées, 8 parcours guidés, un fil transversal sur la productivité, une cartographie des métiers exposés et un module « Où te situes-tu ? ».

Le projet s'appelait auparavant « Orbites de l'IA ». Ce nom peut encore apparaître dans de vieux documents.

Ce qui compte pour le projet (et qui doit guider toute modification) :

- **Rigueur des sources.** Chaque citation affichée est sourcée (URL et date) et porte un statut de vérification. On n'invente jamais une citation et on ne paraphrase jamais entre guillemets.
- **Équilibre.** Chaque courant est présenté par ses meilleurs arguments, puis par ses critiques. Les voix non occidentales (Chine, Japon, Inde, Corée…) sont représentées.
- **Utilité en séance.** Un participant doit pouvoir situer sa position sur au moins 3 lignes de fracture. L'introduction tient en 15 minutes avec le parcours « intro ».

## Structure du dépôt

```
data/corpus.json        Corpus de recherche, source de vérité : sources, personnes, relations,
                        questions de débat, courants, axes, positions des courants, métiers exposés
data/site/layout.json   Familles de planètes, position 3D [x,y,z] et poids [court, long terme]
data/site/tours.json    Parcours guidés (étapes, planète, texte, citations, question)
data/site/thread.json   Fil « Productivité : pour qui, pour quoi ? » (trilemme et branches)
src/index.html          Gabarit HTML du site autonome (placeholders {{…}})
src/body.html           Balisage de l'application (header, scène, panneaux, modale)
src/styles.css          Styles et tokens de thème clair/sombre
src/app.js              Toute la logique front (IIFE, vanilla JS, aucune dépendance hors three.js)
vendor/three-r128/      three.js r128 + OrbitControls + CSS2DRenderer (licence MIT)
vendor/fonts/           Polices auto-hébergées (woff2 variables, OFL) et fonts.css
scripts/build.py        Validation et build (Python 3.9+, bibliothèque standard uniquement)
.github/workflows/      pages.yml : validation sur les PR, build et déploiement GitHub Pages sur main
.github/ISSUE_TEMPLATE/ formulaires d'issue « Proposer une source » et « Signaler une erreur »
LICENSE, data/LICENSE   MIT pour le code, CC BY 4.0 pour le corpus (citations exclues)
dist/                   Sortie du build (non versionnée)
```

## Commandes

```bash
python3 scripts/build.py            # valide les données puis construit dist/
python3 scripts/build.py --check    # valide seulement (à lancer après toute modification de data/)
python3 scripts/build.py --date 2026-11-05   # fixe la date « construit le »
python3 -m http.server 8000 -d dist # sert le site sur http://localhost:8000
```

Le build produit deux sorties :

- `dist/index.html` + `dist/assets/` (styles.css, app.js, data.js) + `dist/vendor/` : c'est le site autonome à héberger. three.js et les polices y sont servis localement (aucun appel à un tiers) et les assets sont versionnés par un `?v=hash`.
- `dist/artifact.html` : c'est la version mono-fichier pour un Artifact claude.ai. Elle n'a pas de doctype ni de head/body (ils sont ajoutés à la publication), tout est en ligne, three.js passe par les CDN autorisés (cdnjs, jsdelivr) et les polices par Google Fonts. Le workflow Pages la supprime avant publication.

Déploiement : chaque push sur `main` lance `.github/workflows/pages.yml`, qui valide, construit avec `--date` = date du dernier commit touchant `data/`, puis publie `dist/` sur https://igocreate.github.io/agoraia/. Les pull requests ne font que la validation et le build.

Il n'y a ni npm ni bundler. Ne pas en introduire sans en discuter.

## Pipeline de données

`build.py` charge le corpus et les fichiers `data/site/`, valide l'ensemble puis produit un objet compact exposé en `window.AGORA_DATA` :

- Sources : `id, t (titre), a (auteurs), pub, d (date), u (url), l (langue), k (type), pl (planètes), cu (courants), th (thèse), kf (faits clés), q (citations), rel (fiabilité), n (notes), rg (région calculée), seed (md5 de l'id, pour un placement 3D stable)`.
- Personnes : `id, n, r, c (pays ISO-2), cu`.
- Relations : `f, t, ty, w`. Les clés `cpos` et `rels` correspondent à `current_pos` et `relations` dans le corpus.
- Le champ `branch` d'une source l'ajoute automatiquement à la branche du même id dans le fil Productivité.
- Région = région majoritaire des pays des auteurs (table `REGION` dans build.py). En cas d'égalité, l'ordre est International > Amérique du Nord > Asie > Océanie > Europe.

Les erreurs bloquent le build : id inconnu, planète sans position, citation de parcours inexistante, etc. Les avertissements ne le bloquent pas : source antérieure à la date limite, citation non vérifiée dans un parcours, type de source non répertorié.

### Ajouter une source (`data/corpus.json` → `sources[]`)

```json
{
  "id": "src-auteur-sujet-annee",
  "title": "…", "authors": ["p-…"], "publisher": "…", "date": "2026-05-12",
  "url": "https://…", "lang": "fr", "kind": "article",
  "planets": ["travail"], "currents": ["economistes-travail"],
  "thesis": "2 à 4 phrases neutres.", "key_facts": ["…"],
  "quotes": [{ "text": "verbatim, langue originale", "fr": "traduction si besoin",
               "speaker": "p-…", "status": "verifiee", "checked_at": "https://…" }],
  "reliability": "primaire", "notes": "réserves, conventions d'attribution", "branch": "mesure"
}
```

- `kind` : article, rapport, étude, déclaration, entretien, essai, loi, discours, livre, vidéo, podcast, fiction, outil. Une `fiction` s'affiche comme un miroir, pas comme une preuve ; ses citations d'entretiens réels portent `"real": true`. Un `outil` a une carte dédiée « Outils pour agir » et un octaèdre doré en 3D.
- `status` : `verifiee` (texte relu mot pour mot dans la source primaire), `a_verifier`, `transcription` (transcription automatique nettoyée).
- Tout auteur ou locuteur doit exister dans `people[]` (`id` en `p-…`, `country` en ISO-2).
- Les citations des parcours se référencent par `[id_source, index_citation]`. Insérer une citation au milieu d'une liste décale les index : ajouter en fin de liste, ou mettre à jour `tours.json`.

### Intégrer une contribution (issues GitHub)

Le bouton « Contribuer » (`openContrib` dans app.js, ancre `#contribuer`) ouvre `issues/new?template=…` pré-rempli par l'URL. Il n'y a ni backend ni appel réseau depuis le site. Il existe deux formulaires, dans `.github/ISSUE_TEMPLATE/` : `1-source.yml` (URL, titre, date, famille, apport, compléments et un brouillon JSON) et `2-erreur.yml` (élément, nature, description, preuve). Les `id` des champs YAML doivent rester identiques aux clés passées à `issueUrl()` dans app.js. Les champs pré-remplis sont des `input`/`textarea`, car GitHub ne pré-remplit pas de façon fiable les listes ni les cases à cocher.

Pour intégrer une proposition de source :
1. relire la source primaire et appliquer les règles ci-dessous (date, verbatim, sites bloqués) ;
2. coller le brouillon JSON dans `sources[]` et compléter les `?` : planète(s), auteurs (`p-…` à créer dans `people[]` si besoin), `lang`, `kind`, `reliability`, `thesis` ;
3. une citation proposée dans les compléments entre en `a_verifier` tant qu'elle n'a pas été relue mot pour mot ;
4. lancer `build.py --check`, puis committer avec `Closes #n`.

## Règles éditoriales (à respecter strictement)

1. **Règle des 3 ans.** Pas de source antérieure au 25/09/2023, date de constitution du corpus (`meta.cutoff`). Les sources plus anciennes (Ellul, Stochastic Parrots, Crawford 2021…) en ont été retirées. Quelques sources de début octobre 2023 dépassent aujourd'hui 3 ans : on ne fait pas glisser la règle sans décision de Clément.
2. **Vérification des citations.** Une citation n'est `verifiee` que si elle a été retrouvée mot pour mot dans la source primaire. Le protocole consiste à extraire le verbatim, puis à contrôler la chaîne exacte par une seconde lecture. Si c'est impossible, le statut reste `a_verifier`, et l'on précise dans `notes` d'où vient la citation (recension, média secondaire).
3. **Sites bloqués.** Ne jamais contourner un site inaccessible (archives, miroirs, caches). C'est le cas notamment de lemonde.fr, usbeketrica.com, reporterre.net, numerama.com et YouTube. On cherche une autre source primaire ou on demande le texte à Clément.
4. **Faits datés.** Les dates, chiffres et statuts juridiques (décisions annulées, accords provisoires…) doivent être recoupés. Les résumés automatiques ont déjà produit des erreurs, par exemple une hypothèse présentée comme un fait accompli.
5. **Cadrage.** Le centre de l'univers est formulé comme une question, pour ne pas reprendre sans recul le récit catastrophiste des labos. On parle de « convergence instrumentale » plutôt que d'« instinct de survie » des IA.
6. **Langue.** Interface et contenus en français, sans emoji. Les citations restent dans leur langue originale, avec une traduction dans `fr`.
7. **Tout est public.** Le dépôt et `data.js` sont publics, y compris `notes`, `context`, `checked_at` et `lot`. On n'y nomme pas les membres de l'équipe et on n'y met aucun lien privé (Google Docs, Drive…). Un texte reçu hors de la source primaire se décrit comme « texte transmis » et sa citation reste `a_verifier`.

## Front-end (src/app.js)

Le code est organisé en sections commentées `// ---------- … ----------` :

- **index** : tables `P` (planètes), `S` (sources), `PE` (personnes), `CU` (courants), `FAM` (familles).
- **état** : filtres (recherche, courants, régions, horizon court/long terme).
- **contrôles**.
- **panneau** : `showHome`, `showPlanet`, `showSource`, `showCurrent`, `showPerson`, `showThread` et le SVG du trilemme. `select({type,id})` sert de point d'entrée unique.
- **vue liste**.
- **univers 3D** : module `U`.
- **visite guidée** : `startTour(id, step)`.
- **où te situes-tu** : `openPos` et les 8 axes.
- **contribuer** : `openContrib(mode, ctx)`, `issueUrl` (formulaires d'issue GitHub pré-remplis).
- **démarrage** : les ancres `#visite` et `#productivite` lancent un parcours.

Points techniques à ne pas casser (bugs déjà rencontrés) :

- **Version de three.js.** On utilise three.js r128 en globales UMD (`THREE.OrbitControls`, `THREE.CSS2DRenderer`). Ne pas passer aux modules ES ni à une autre version sans tester l'ensemble.
- **OrbitControls.** Ils sont attachés à `#scene`, pas à la couche de labels CSS2D, qui est en `pointer-events:none`. Sinon, la rotation au trackpad ne marche plus. Le clic ne sélectionne que si le pointeur n'a pas glissé. Les boutons caméra et les flèches/+/- du clavier doublent la souris.
- **Labels CSS2D.** On les masque via `obj.visible`, jamais via `style.display`. `#scene` a `isolation:isolate; z-index:0`, faute de quoi les labels passent au-dessus des panneaux. Les labels de sources ne s'affichent que sur une planète focalisée qui compte 12 sources ou moins.
- **Attribut hidden.** La règle `[hidden]{display:none!important}` est indispensable : sans elle, les modales cachées interceptent les clics.
- **Mise en page.** Sur desktop, la scène s'arrête à `right: var(--panel-w)`. La vue liste se décale quand le panneau de filtres est ouvert.
- **Thèmes.** Les couleurs viennent des tokens CSS (`--f-futurs`, `--f-pouvoirs`, `--f-societes`, `--f-centre`…), lus par `readTokens()` pour la 3D. Tout changement de couleur se fait dans `:root` et dans ses deux variantes sombres.
- **Stockage.** Le `localStorage` est préfixé `agoraia:` et toujours appelé dans un try/catch.
- **Accessibilité.** Les citations portent l'attribut `lang` de leur source. Le site respecte `prefers-reduced-motion`. Sans WebGL, il bascule sur la vue liste. Sous 600 px de large, la vue liste est la vue par défaut.

## Vérifier une modification

1. Lancer `python3 scripts/build.py` : 0 erreur, et relire les avertissements nouveaux.
2. Servir `dist/` et tester : rotation et zoom au trackpad, clic sur une planète puis sur une source, un parcours complet, la vue liste avec les filtres, les thèmes clair et sombre, l'affichage mobile.
3. Pour un changement de données, vérifier dans le panneau que la source apparaît sur la bonne planète, avec ses citations et son badge de statut.

## Contexte et décisions ouvertes

- Hébergement : dépôt public `igocreate/agoraia`, publié sur GitHub Pages. Pour passer au domaine d'Igocreate, changer `SITE_URL` dans build.py et déclarer le domaine dans Settings → Pages.
- Licences : MIT pour le code, CC BY 4.0 pour le corpus. Les citations en sont exclues : ce sont des extraits courts, attribués et sourcés (droit de courte citation).
- Mentions légales : dans `showHome` (app.js), section « Mentions légales ». Éditeur Igocreate (SAS, siège et RCS repris du registre national des entreprises), directeur de la publication Clément Le Tétour, hébergeur GitHub. À mettre à jour si l'hébergement ou la société change.
- Le corpus a été constitué avec Claude (Anthropic), alors qu'Anthropic est aussi l'un des acteurs cartographiés. Il faut le dire et rester vigilant sur l'équilibre.
- Pistes non lancées (ne pas démarrer sans accord) :
  - parcours « L'AGI arrive-t-elle ? » ;
  - transcriptions de 2 autres vidéos (liste tenue hors du dépôt) ;
  - sources récentes de Dominique Méda ;
  - voix françaises des métiers créatifs ;
  - relecture des 20 citations `a_verifier` ;
  - atelier « Follow the Stack ».
