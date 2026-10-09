# Cotonou 3D

Cotonou, Abomey-Calavi, Ganvié et Ouidah en 3D dans le navigateur. Au démarrage, la vue réelle de Google
(images satellite et relief) s'affiche sous la maquette ; la maquette 3D s'appuie sur les bâtiments
détectés par Google (Google Open Buildings, 660 000 emprises en plus des 88 000 d'OpenStreetMap) et sur
les rues d'OpenStreetMap (12 000 voies), le lac Nokoué et le littoral. Les grands lieux sont reconstitués
d'après des photos, et le jeu **Zém Run** fait découvrir les quartiers au guidon d'un zémidjan
ou dans un tokpa-tokpa.

## Tester

**En ligne, sans rien installer** : https://tours-two-ashen.vercel.app — projet Vercel « tours », relié
à ce dépôt : chaque envoi sur `main` le republie. La clé Google y est une variable d'environnement
du projet (`VITE_GOOGLE_MAPS_KEY`), à restreindre au domaine dans la console Google Cloud.

**Sur son ordinateur** (Node.js 20 ou plus) :

```bash
git clone https://github.com/MuriellekPINSO/Benin3D.git
cd Benin3D
npm install
npm run dev          # puis ouvrir http://localhost:5173
```

Tout ce qu'il faut est dans le dépôt : données de la ville, bâtiments, modèles 3D, photos et
vidéos. Pour la vue réelle Google et Street View, copier `.env.example` en `.env.local` et y mettre
une clé Google Maps (facultatif). La visite se fait sur « Agolo » d'Angélique Kidjo (`public/audio/agolo.mp3`) : œuvre protégée, dont
les droits restent à obtenir pour une diffusion publique.

À essayer : la visite (bouton Présentation), la vue réelle, les fiches « Sur place », la météo
(touche M), et Zém Run — ↑ accélérer, ↓ freiner, E interagir, au carrefour ralentir puis ← ou → (T : tout droit)
pour tourner, manette Xbox ou PlayStation acceptée.

## Fichiers non versionnés

- `.env.local` : la clé Google Maps (voir plus bas).
- `sources/masques/` et `sources/art/` : modèles 3D d'origine (Tripo, 60 à 72 Mo chacun) ;
  les versions allégées utilisées par le site sont dans `public/modeles/`.
- `osm/` : extraits OpenStreetMap et Google Open Buildings bruts (`npm run donnees` les lit).

## Lancer le projet

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # version publiable dans dist/
npm run preview    # sert dist/ pour vérifier
npm run verifier   # ESLint sur src/
```

## Organisation

| Dossier, fichier | Contenu |
| --- | --- |
| `index.html` | page, interface (panneaux, dock, jeu, présentation) |
| `src/main.js` | démarrage et boucle de rendu |
| `src/scene.js` | rendu, caméra, ciel, lumières |
| `src/ville.js` | sol, eau, routes, bâtiments, palmiers, conteneurs, navires |
| `src/lieux.js` | monuments reconstitués (Étoile Rouge, Amazone, Marina, Congrès, cathédrale, stade, port, aéroport, Dantokpa, Ganvié, Corniche, UAC, Sèmè One) |
| `src/lieux-videos.js` | lieux relevés sur les vidéos de drone : Sofitel, tour BCEAO, Erevan et Bio Guéra, rond-point de l'aéroport, mosquée de Zongo, cimetière |
| `src/vehicules.js` | zémidjans de « 3D monde » (`moto-taxi.glb`, `zem.glb`), tokpa-tokpa, voitures |
| `src/trafic.js` | circulation : zémidjans, tokpa-tokpa aux portes de la ville, lampadaires |
| `src/jeu.js` | Zém Run : lignes, obstacles, arrêts, quiz |
| `src/bordure.js` | ce qui rend un trajet reconnaissable : enseignes des vrais commerces (OSM) au bord de la route, stations-service, boutiques-conteneurs, kpayo, kiosques MoMo, vulcanisateurs, poteaux électriques, plaques de rue, carte « à droite : … » devant les monuments, mini-carte |
| `src/google.js` | Street View, vue satellite 3D, « Vue réelle », photos des cartes du jeu |
| `src/satellite.js` | sol satellite (tuiles Map Tiles) sous la ville |
| `src/rue.js` | habillage des rues autour de la caméra (carrés de 400 m, vue rapprochée et jeu) : murs de clôture et portails en tôle, maisons derrière les murs là où OSM n'a rien, boutiques au rideau métallique et auvents, trottoirs pavés, lampadaires solaires, panneaux 4 × 3, inscriptions peintes, poteaux et fils, citernes sur les toits |
| `src/facades.js` | atlas des façades (portes de garage, boutiques, persiennes, balcons, étage inachevé) |
| `src/ouidah.js` | Porte du Non-Retour et Arène de Ouidah (reprise de l'artifact « Arène de Ouidah », recalée sur la vue satellite Google), spectacle de masques dans l'arène |
| `src/monde-reel.js` | « Vue réelle » : la 3D Google sous la maquette, caméra Google calée sur la nôtre à chaque image (même position, cap, inclinaison et champ de vision) |
| `src/altitude.js` | altitude du sol (tuiles Terrarium d'AWS, données ouvertes) pour caler la caméra Google |
| `src/discussions.js` | Zém Run qui parle (à la Danfo Run) : bulles au-dessus des gens, groupes qui causent au bord de la route, vendeuses qui appellent, réactions au klaxon, client du zém avec qui l'on discute le prix et qui fait la causette (réponses 1, 2, 3), collecteur du syndicat, apprenti du tokpa-tokpa |
| `src/voix.js` | Les personnages parlent à voix haute : synthèse vocale du navigateur (gratuite, sans clé), une voix de femme ou d'homme par personne, seulement ceux qui sont près du zém ; le dialogue passe devant les bavardages. Option « Voix des personnages » dans le menu du jeu |
| `src/regles.js` | Code de la route de Zém Run (cahier des charges de Schekina) : feux tricolores du trajet (les vrais feux d'OSM qu'il traverse), police et amende au feu rouge, accidents (constat de police ou client qui descend) |
| `src/feux.js` | Les 81 feux tricolores et 38 passages piétons réels d'OpenStreetMap (`osm/feux.json`, Overpass), posés dans la ville avec un cycle synchronisé par carrefour |
| `src/terre-pleins.js` | Terre-pleins centraux des boulevards à deux chaussées (calculés par `scripts/donnees.mjs`, calés sur la vue satellite Google) : marquage, séparateur béton ou gazon planté selon la largeur |
| `src/remise.js` | Ce qu'on achète, on le reçoit : le billet passe au vendeur, l'objet (eau, beignets, essence, casque, carte de crédit, souvenir…) arrive dans la main du zém ou du client |
| `src/musique.js` | Musique du jeu selon le quartier, composée à la volée (Web Audio, motifs originaux, aucun morceau protégé), et ambiance « concert » de l'événement |
| `src/multijoueur.js` | Mode deux joueurs : connexion directe entre navigateurs (WebRTC via le service public PeerJS), code de 4 lettres ; chacun voit le véhicule de l'autre et entend son klaxon |
| `src/evenement.js` | Concert sur l'esplanade de l'Amazone (scène, écran, lumières, foule qui danse), entrée 50 F en monnaie du jeu |
| `src/personnages.js` | Personnages béninois réalistes et animés (modèles Tripo avec squelette) : chargement, choix selon le genre ou le rôle (policier, zém), animations (attente, marche, salut, discussion, téléphone, assis, rire), tête et main suivies pour les bulles, le casque et les objets échangés. Sans eux, le jeu garde ses personnages dessinés en code |
| `src/pietons.js` | Passants de Zém Run : ils marchent sur les trottoirs le long de la course, traversent au passage piéton quand le feu est rouge pour les motos (accident si on les touche au rouge) ; marchandes avec leur bassine sur la tête |
| `src/missions.js` | missions (3 à la fois), cagnotte, série de jours, garage (klaxons, casque neuf, super saut) |
| `src/artisans.js` | marchés artisanaux (Porte du Non-Retour, Arène, Place de l'Amazone) : objets d'art 3D, discussion du prix avec la vendeuse, paiement avec la cagnotte, « Mes souvenirs » |
| `src/publicites.js` | catalogue des campagnes publicitaires (panneaux de la ville et du jeu), affichages comptés, offre aux annonceurs |
| `src/batiments-google.js` | bâtiments Google Open Buildings chargés par tuiles de 1 km autour de la caméra |
| `src/meteo.js` | météo (bouton du dock, touche M) : soleil, nuages, pluie tropicale, orage avec éclairs et tonnerre de synthèse ; route glissante dans Zém Run |
| `src/manette.js` | manettes Xbox / PlayStation (API Gamepad) : conduite, réponses, menus, déplacement dans la ville, vibrations |
| `src/surplace.js` | onglet « Sur place » des fiches : photos prises à Cotonou et passages des vidéos de drone (`npm run photos`) |
| `src/egungun.js` | masques Egungun (modèles 3D fournis, ou version dessinée en secours), Zangbeto de raphia, processions du jeu |
| `src/explorer.js` | filtres, radio, mode Présentation |
| `src/interface.js` | étiquettes, fiches, vols de caméra, boussole et échelle |
| `src/ambiances.js` | jour, soir, nuit |
| `src/donnees-lieux.js` | textes des lieux et des quartiers |
| `src/etat.js` | état partagé entre les modules |
| `public/donnees/cotonou.json.gz` | données de la ville, produites par `npm run donnees` |
| `public/modeles/` | modèles 3D servis par la page |
| `sources/` | modèles d'origine de « 3D monde », d'où `npm run modeles` tire les versions allégées |
| `public/audio/radio.mp3` | musique du bouton Radio |
| `public/audio/agolo.mp3` | « Agolo » d'Angélique Kidjo, joué pendant la visite (Présentation) — œuvre protégée : obtenir les droits avant une mise en ligne publique |
| `sources/art/` | objets d'art d'origine (Tripo) ; `npm run masques` en tire `public/modeles/{tete-sculptee,portrait-cubiste,sphere-rouge,statue,creature-paille}.glb` |
| `sources/masques/` | modèles d'origine des masques (Tripo, ~2 M de triangles) ; `npm run masques` en tire `public/modeles/zangbeto.glb`, `egungun-traditionnel.glb`, `egungun-groupe.glb` (~1 Mo chacun) |
| `scripts/donnees.mjs` | OSM → `cotonou.json.gz` (bâtiments, routes, eau ; lignes du jeu par les grands axes et devant les monuments, avec noms de rues et commerces proches) |
| `scripts/modeles.mjs` | versions allégées des zémidjans pour la circulation |
| `artefact/` | ancienne version en un seul fichier HTML (artefact claude.ai) |

## Google Maps

La clé se met dans `.env.local` (jamais versionné) :

```
VITE_GOOGLE_MAPS_KEY=…
```

Elle sert à :
- **Voir en vrai** (fiche d'un lieu) : photo 360° Street View et vue satellite 3D — API *Maps JavaScript* ;
- **Vue réelle** (dock) : la 3D de Google s'affiche sous la maquette, calée sur la caméra, en exploration comme dans
  Zém Run — API *Maps JavaScript*. Le bouton **Maquette** ajoute nos bâtiments, arbres et monuments par-dessus ;
  pendant le jeu, ils sont toujours là (et nos routes aussi), car l'image satellite est floue au ras du sol ;
- **photos dans Zém Run** : la photo Street View du monument longé et de l'arrêt desservi — API *Maps JavaScript* ;
- **Sol satellite** (dock) : les tuiles satellite sous les bâtiments 3D — API *Map Tiles*.
  Pour tester sans clé : `http://localhost:5179/?satdebug` (tuiles de test).

Restrictions à mettre sur la clé (console Google Cloud → Identifiants) :
- restriction d'application « Sites Web » : `http://localhost:5179/*`, `http://127.0.0.1:5179/*`, puis le domaine de publication ;
- restriction d'API : *Maps JavaScript API* et *Map Tiles API* seulement ;
- un quota par jour sur chaque API et une alerte de budget sur le compte de facturation.

Sans clé, ces boutons disparaissent et le reste fonctionne.

## Régénérer les données

Les extraits OpenStreetMap bruts vont dans `osm/` (non versionné, ~45 Mo, téléchargés avec
l'API Overpass). Ensuite :

```bash
npm run donnees    # reconstruit public/donnees/cotonou.json.gz
npm run modeles    # reconstruit public/modeles/*-lod.glb
```

## Zémidjans

Les zémidjans viennent du projet « 3D monde » :
- `moto-taxi.glb` : conducteur au gilet jaune et moto sombre. C'est la moto du joueur dans
  Zém Run et, en version allégée (`moto-taxi-lod.glb`, 11 000 triangles), les motos de la
  circulation à moins de 300 m de la caméra ;
- `zem.glb` : moto rouge, conducteur en chemise jaune et passagère. Il sert d'obstacle dans le jeu
  (version allégée `zem-lod.glb`, avec le corsage en wax ajouté dans 3D monde).

Les modèles sont redressés au chargement avec la méthode de `Rues.redresser` de 3D monde.

## À savoir

- Seuls 39 bâtiments ont un nombre d'étages dans OpenStreetMap : les autres hauteurs sont estimées.
- Les tokpa-tokpa sont interdits dans Cotonou depuis 2021 : ils ne roulent qu'aux portes de la ville.
- `radio.mp3` provient d'une vidéo trouvée en ligne : à remplacer par une musique libre de droits
  avant toute publication.
- Données © contributeurs OpenStreetMap (ODbL). Photos de référence : Wikimedia Commons.

## Publicité dans le jeu

Les panneaux 4 × 3 de la ville et les grands panneaux le long des lignes de Zém Run viennent tous du
catalogue `CAMPAGNES` de `src/publicites.js` (MTN MoMo, Moov Money, Vodun Days, Bénin Révélé, Qualiwo,
« Votre pub ici »…). Pour une vraie campagne :

1. ajouter une entrée au catalogue (`id`, `marque`, `titre`, `sous`, couleurs, `poids` = fréquence) ;
2. déposer le visuel de l'annonceur (4:3, 1024 × 768) dans `public/pubs/` et l'indiquer dans `image` ;
3. renseigner `CONTACT_PUB` (affiché dans l'offre, bouton « Annonceurs » du menu du jeu).

Les affiches dessinées n'utilisent pas les logos des marques ; afficher une marque réelle dans une version
publique demande l'accord de l'annonceur. Les affichages sont comptés par campagne (sur l'appareil du joueur).

## Façades d'après photos

`public/textures/erevan-facade.jpg` : bandeau haut de la façade du centre commercial Erevan, tiré de la
photo « Centre commercial Erevan de Cotonou 08 » d'Alex Ahdn (Wikimedia Commons, CC BY-SA 4.0), redressée,
recadrée et nettoyée des poteaux et drapeaux.
`public/textures/cathedrale-facade.jpg` : pignon de la Cathédrale Notre-Dame, tiré de la photo « Cathédrale
Notre-Dame-de-misericordes à Cotonou » de Saliousoft (Wikimedia Commons, CC BY-SA 4.0), redressée par homographie,
le bas caché par la clôture recomposé à partir des rayures.
`public/textures/dantokpa-facade.jpg` : façade du grand bâtiment du marché Dantokpa vue de la lagune, photo
« Marché Dantokpa (vue arrière) » de jbdodane (Wikimedia Commons, CC BY 2.0).
`public/textures/porte-facade.jpg` + `porte-alpha.jpg` : la Porte du Non-Retour, photo « Porte du non-retour au
Benin » de Borisghost (Wikimedia Commons, CC0), vides découpés par le masque d'alpha.
`public/textures/bceao-face.jpg` : face de la tour BCEAO (cauris compris), photo « BCEAO tower Cotonou, Benin2 »
d'Adoscam (CC BY-SA 4.0), redressée, étages du bas recomposés. `marina-facade.jpg` : étages du Palais de la
Marina, photo « Palais de la Marina… 01 » d'Adoscam (CC BY-SA 4.0). `stade-lames.jpg` : tribune du Stade de
l'Amitié, photo « Vue de côté du stade… » d'Adoscam (CC BY-SA 4.0). `sofitel-facade.jpg` + `sofitel-alpha.jpg` :
entrée du Sofitel, photo « Sofitel Cotonou Marina Hôtel & Spa » de Freed Armel (CC BY-SA 4.0), ciel détouré.
Crédits affichés dans le bandeau du site. Même licence (CC BY-SA 4.0, CC BY 2.0) pour toute réutilisation des
textures qui en relèvent.

## Zém Run : cahier des charges de Schekina (octobre 2026)

| Fonctionnalité | Priorité | Statut |
|---|---|---|
| Contrôles aux flèches (pas d'accélération automatique) | 1 | Fait |
| Fin de course, paiement affiché, nouveau client qui fait signe | 1 | Fait |
| Feux tricolores (vrais feux d'OSM) | 1 | Fait |
| Casques du zém et du client (le sien, prêté ou acheté) | 1 | Fait |
| Police et amende au feu rouge | 2 | Fait |
| Accidents : constat de police ou course perdue | 2 | Fait |
| Discussion et marchandage avec les vendeurs | 2 | Fait |
| Musique selon la zone (composée par le jeu) | 2 | Fait |
| Raccourci payant (client pressé) | 3 | Fait |
| Voiture déblocable (taxi, prix d'exemple 5 F, à confirmer) | 3 | Fait |
| Mode deux joueurs | 4 | Fait, à deux, sans serveur (WebRTC) ; au-delà de deux joueurs, il faudra un serveur temps réel |
| Événement 3D | 4 | Fait sous un nom générique ; entrée de 50 F avec la cagnotte du jeu ou par MoMo (FedaPay, prêt, en attente des clés) |

Réserves du cahier des charges, respectées :
- les montants (amendes, casque, raccourci, voiture) sont en monnaie du jeu. Seule l'entrée du concert peut se payer pour de vrai, par MTN MoMo ou Moov Money via FedaPay (voir plus bas) ;
- l'événement n'utilise pas le nom ni l'univers de WeLoveEya. Il faut l'accord des organisateurs pour s'en servir ;
- la musique est générée par le jeu et ne reprend aucun morceau protégé ;
- le mode deux joueurs passe par le service public de mise en relation PeerJS. Derrière certains réseaux d'entreprise, il faudrait aussi un serveur relais (TURN).

## Paiement MoMo de l'entrée du concert (FedaPay)

L'entrée du concert (50 F) peut se payer pour de vrai par MTN MoMo ou Moov Money, avec FedaPay Checkout :
une petite fenêtre FedaPay où le joueur tape son numéro, puis valide sur son téléphone. Le billet payé
vaut pour la journée sur l'appareil (`localStorage`).

- `src/paiement.js` : charge `checkout.js` de FedaPay à la demande, ouvre la fenêtre, puis demande au
  serveur si la transaction est payée (en redemandant tant qu'elle est `pending`, 24 s au plus) ;
- `api/fedapay.js` : fonction Vercel `GET /api/fedapay?id=<transaction>`, qui relit la transaction chez
  FedaPay avec la clé secrète et répond `{ paye, statut }` (payé = `approved` et au moins 50 F).
  En local, `npm run dev` et `npm run preview` la servent aussi (`vite.config.js`) ;
- clés (voir `.env.example`) : `VITE_FEDAPAY_PUBLIC_KEY` (publique, dans la page) et `FEDAPAY_SECRET_KEY`
  (secrète, seulement sur le serveur), dans `.env.local` et dans les variables d'environnement Vercel.
  `pk_sandbox_` / `sk_sandbox_` = mode test, `pk_live_` / `sk_live_` = vrais paiements. Sans clé publique,
  le bouton MoMo n'apparaît pas et l'entrée se paie seulement avec la cagnotte.

Numéros de test FedaPay (mode sandbox) : MTN 66000001 (réussi) / 66000000 (échec), Moov 64000001 (réussi) /
64000000 (échec).

## Bâtiments reconnaissables : modèles 3D générés d'après photos

`public/modeles/batiments/<id>.glb` (liste dans `index.json`) : Palais des Congrès, Cathédrale, Porte du Non-Retour,
colonne de l'Étoile Rouge, cavalier de Bio Guéra, Le Dôme, grand bâtiment de Dantokpa, Tour BCEAO, Sofitel. Générés avec l'API Tripo (`npm run tripo -- <id> <photo>`,
clé `TRIPO_API_KEY` dans `.env.local`, ~40 crédits par modèle) à partir de photos libres de Wikimedia Commons
(`scripts/tripo-photos.json` : auteur, licence, page), puis allégés à 80 000 triangles (`alleger`). Les retouches de
couleur par modèle sont dans `scripts/tripo-reglages.json`, la pose dans la ville (rotation, décalage) dans
`src/batiments-tripo.js` (`REGLAGES`). Les modèles d'origine (50 Mo chacun) restent dans `sources/tripo/`, non versionné.
Ces modèles dérivent de photos CC BY / CC BY-SA / CC0 : crédits dans le bandeau du site, même licence pour les réutiliser.

## Version anglaise (bouton FR / EN)

Le site existe en français (racine) et en anglais (`/en/`), construits à partir du même code par
`npm run build` (`scripts/i18n/construire.mjs`). Pendant la construction anglaise, le module de Vite
`scripts/i18n/vite-langue.mjs` remplace les textes français du code, de la page et de la feuille de style
par leur traduction, rangée dans `i18n/` :

- `en-textes.json` (par fichier), `en-html.json` : tirés de la première traduction anglaise par
  `scripts/i18n/extraire.py` (alignement jeton par jeton de l'ancien code et de sa copie anglaise) ;
- `en-complement.json` : les textes ajoutés depuis (et quelques corrections) — c'est là qu'on ajoute les
  nouveaux ; `node scripts/i18n/manquants.mjs` liste ceux qui n'ont pas encore de traduction ;
- `en-donnees.json` : noms des lignes et textes des arrêts ; `node scripts/i18n/donnees-en.mjs` en tire
  `public/donnees/cotonou.en.json.gz` (à relancer après `npm run donnees`).

Le français reste la langue du code. Une phrase à accorder s'écrit en entier (`f ? 'ravie' : 'ravi'`), pas
en collant un « e », pour pouvoir la traduire.

## Personnages animés

`public/modeles/personnages/<id>.glb` (liste dans `index.json`) : vendeuse en pagne wax, jeune en maillot de foot,
ancien en boubou, étudiante, employé en chemise wax, grand-mère, policier, zémidjan en chemise jaune, et deux
écoliers en uniforme kaki (passants seulement, jamais clients). Les danses du concert (danse1, danse2, acclame)
sont dans `<id>-danses.glb`, chargés à l'entrée du concert. Fabriqués par
`npm run personnages -- <id>` (ou `tout`) avec l'API Tripo, à partir d'une description (`scripts/personnages.mjs`) :
modèle texturé (~30 crédits), squelette humain (auto-rig), puis une animation par demande (~10 crédits chacune),
fusionnées dans un seul fichier de ~0,8 Mo (13 000 triangles, textures webp). Les étapes faites sont notées dans
`sources/personnages/<id>.json` (non versionné) : une coupure ne fait rien repayer. Les accessoires (bassines de
fruits portées sur la tête) sont dans `public/modeles/personnages/accessoires/`, rangés là par `scripts/accessoire.mjs`
à partir d'un modèle `npm run tripo -- texte`.

## D'où viennent les données

- **Google (Maps JavaScript API)** : la vue réelle (images satellite, relief, bâtiments 3D là où Google en a),
  Street View. Google ne permet pas de réutiliser ses cartes pour construire une autre carte : on les
  affiche dans son propre visualiseur, calé sous la maquette.
- **Google Open Buildings v3** (Google Research, licence CC BY 4.0) : emprises des bâtiments détectées sur les
  images satellite. Extrait des tuiles S2 `1023`, `1025` et `103d` (zone 6,30–6,50 N, 2,04–2,62 E,
  confiance ≥ 0,70) dans `osm/google_open_buildings.csv.gz` ; `npm run donnees` écarte celles qu'OSM a
  déjà et écrit les tuiles `public/donnees/batiments/`.
- **OpenStreetMap** (licence ODbL) : rues et routes (trajets du jeu, noms de rues), commerces, plans d'eau,
  et 88 000 bâtiments avec leurs étiquettes. Google ne publie pas de données de rues réutilisables.
