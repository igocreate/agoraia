# Agora IA

Une carte des débats sur les enjeux sociétaux, scientifiques et politiques de l'IA, à explorer seul ou à utiliser pour animer un groupe, quel que soit son horizon. Le site a d'abord servi de support à une séance entre ingénieurs logiciel (novembre 2026).

**Site : https://igocreate.github.io/agoraia/**

Le site présente un univers 3D : 15 thématiques en orbite autour d'une question centrale, « Survie et contrôle : qui garde la main sur l'IA ? ». On y trouve aussi :

- des courants de pensée, présentés par leurs meilleurs arguments puis par leurs critiques, avec des voix d'Europe, d'Amérique du Nord, d'Asie, d'Afrique et d'Amérique latine ;
- plus de 200 sources publiées depuis septembre 2023, avec des citations dans leur langue d'origine, traduites, et marquées « vérifiée », « à vérifier » ou « transcription » ;
- 6 publics (tout public, grand public, élèves et étudiants, entreprises, élus, ingénieurs), qui adaptent les questions de débat et les parcours ;
- 8 parcours guidés, dont une introduction de 15 minutes, et un outil pour composer une séance à partir des thématiques choisies, avec un lien à partager au groupe ;
- un fil transversal « Productivité : pour qui, pour quoi ? » et une cartographie des métiers exposés ;
- le module « Où te situes-tu ? », pour se positionner sur les lignes de fracture du débat.

Une vue liste remplace la 3D sur mobile ou sans WebGL.

## Méthode

Une citation n'est marquée « vérifiée » que si elle a été retrouvée mot pour mot dans la source primaire. Les autres sont signalées comme telles, avec leur provenance. Le classement des sources en courants est un choix éditorial, discutable par nature.

Le corpus a été constitué avec l'aide de Claude (Anthropic). Anthropic figure aussi parmi les acteurs cartographiés, d'où une vigilance particulière sur l'équilibre.

## Contribuer

Une source à proposer, une erreur à signaler ? Utilise le bouton « Contribuer » du site ([lien direct](https://igocreate.github.io/agoraia/#contribuer)), ou ouvre directement [une proposition de source](https://github.com/igocreate/agoraia/issues/new?template=1-source.yml) ou [un signalement d'erreur](https://github.com/igocreate/agoraia/issues/new?template=2-erreur.yml). Le site ne transmet rien lui-même : il ouvre un formulaire GitHub pré-rempli que tu relis puis soumets. Chaque contribution est relue avant d'être intégrée.

## Construire le site

Il faut seulement Python 3.9 ou plus, sans aucune dépendance.

```bash
python3 scripts/build.py            # valide les données puis construit dist/
python3 scripts/build.py --check    # valide seulement
python3 -m http.server 8000 -d dist # sert le site sur http://localhost:8000
```

Les données sont dans `data/corpus.json` (sources, personnes, courants, relations…) et dans `data/site/` (disposition 3D, parcours, fil Productivité). Le front-end est en JavaScript sans framework, dans `src/`, avec three.js r128 servi depuis `vendor/`. Le format des données et les règles éditoriales sont décrits dans [CLAUDE.md](CLAUDE.md).

Chaque push sur `main` déclenche [le workflow GitHub Actions](.github/workflows/pages.yml), qui valide les données, construit le site et le publie sur GitHub Pages.

## Licences

- Code : [MIT](LICENSE).
- Corpus (`data/`) : [CC BY 4.0](data/LICENSE). Les citations en sont exclues : ce sont des extraits courts d'œuvres de tiers, attribués et sourcés, qui restent la propriété de leurs auteurs.
- three.js : MIT. Polices Bricolage Grotesque, Source Serif 4 et JetBrains Mono : SIL Open Font License 1.1.

Édité par [Igocreate](https://www.igocreate.com).
