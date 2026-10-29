# Georges Studio API

API backend de Georges Studio, développée en Node.js avec Express et Supabase. Elle sert à gérer les catégories de séances photo, la galerie, les créneaux disponibles, les réservations client et l’administration du studio.

## Fonctionnalités principales

- Gestion des types de séances photo
- Galerie de photos par catégorie
- Créneaux de disponibilité du studio
- Réservation client avec validation et contrôle de conflits
- Authentification JWT pour l’admin
- Suivi des activités et logs d’admin
- Envoi d’emails de confirmation / notification
- Protection par rate limiting, CORS et Helmet
- Keepalive automatique pour éviter la pause de Supabase

## Stack

- Node.js
- Express
- Supabase JS
- PostgreSQL via Supabase
- JWT
- bcrypt
- nodemailer
- Helmet, CORS, express-rate-limit

## Prérequis

- Node.js 18+
- Un projet Supabase actif
- Un compte Gmail ou fournisseur SMTP pour les emails

## Installation

```bash
npm install
cp .env.example .env
```

## Variables d’environnement

Créer un fichier `.env` en s’appuyant sur le modèle suivant :

```env
PORT=3000
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=change_this_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
PHOTOGRAPHER_EMAIL=photographer@example.com
ADMIN_URL=https://admin.example.com
CORS_ORIGIN=http://localhost:3000,https://votre-site.fr
TRUST_PROXY=1
JSON_BODY_LIMIT=25mb
KEEPALIVE_INTERVAL_MS=43200000
```

Notes :
- `SUPABASE_SERVICE_ROLE_KEY` est recommandé côté serveur.
- `SUPABASE_ANON_KEY` couvre le cas où la clé service n’est pas utilisée.
- `CORS_ORIGIN` est optionnel, mais recommandé en production.
- `JWT_SECRET` doit être unique et très sécurisé.

## Lancement

Mode développement :

```bash
npm run dev
```

Mode production :

```bash
npm start
```

Le serveur démarre ensuite sur :

```text
http://localhost:3000
```

## Structure du projet

```text
.
├── .env.example
├── package.json
├── server.js
├── migrate.js
├── README.md
├── src/
│   ├── config/
│   │   ├── studio.js
│   │   └── supabase.js
│   ├── controllers/
│   │   ├── adminController.js
│   │   ├── disponibiliteController.js
│   │   ├── photoController.js
│   │   ├── pingController.js
│   │   ├── reservationController.js
│   │   └── typePhotoController.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── routes/
│   │   └── index.js
│   └── utils/
│       ├── activityLogger.js
│       ├── keepalive.js
│       ├── notifications.js
│       ├── slotGenerator.js
│       └── validation.js
└── backend/
    └── migration utilitaire
```

## Points d’entrée principaux

- `server.js` : démarre l’API Express et charge les routes
- `src/routes/index.js` : enregistre tous les endpoints
- `src/controllers/*` : logique métier
- `src/config/studio.js` : heures d’ouverture et configuration du studio
- `src/config/supabase.js` : client Supabase
- `src/utils/notifications.js` : envoi d’emails
- `src/utils/keepalive.js` : ping automatique vers Supabase

## API REST

### Public

```text
GET    /api/ping
GET    /api/config/studio
GET    /api/type-photos
GET    /api/type-photos/:slug
GET    /api/photos
GET    /api/photos/par-categorie/:slug
GET    /api/disponibilites
POST   /api/reservations
```

### Administration (JWT requis)

```text
POST   /api/admin/login
POST   /api/admin/create
GET    /api/admin/me
PUT    /api/admin/profile
PATCH  /api/admin/profile
PUT    /api/admin/password
PATCH  /api/admin/password

GET    /api/admin/studio-config
PUT    /api/admin/studio-config

GET    /api/admin/type-photos
POST   /api/admin/type-photos
PUT    /api/admin/type-photos/:id
PATCH  /api/admin/type-photos/:id
DELETE /api/admin/type-photos/:id

GET    /api/admin/photos
POST   /api/admin/photos
PUT    /api/admin/photos/reorder
PUT    /api/admin/photos/:id
PATCH  /api/admin/photos/:id
DELETE /api/admin/photos/:id

GET    /api/admin/disponibilites
POST   /api/admin/disponibilites
PUT    /api/admin/disponibilites/:id
DELETE /api/admin/disponibilites/:id
POST   /api/admin/disponibilites/client

GET    /api/admin/reservations
GET    /api/admin/reservations/:id
PATCH  /api/admin/reservations/:id
PUT    /api/admin/reservations/:id
PATCH  /api/admin/reservations/:id/statut
PUT    /api/admin/reservations/:id/statut
DELETE /api/admin/reservations/:id
```

## Modèle de données

L’API s’appuie sur des tables Supabase, notamment :

- `admins`
- `type_photos`
- `photos`
- `disponibilites`
- `reservations`
- `activity_logs`
- `studio_settings`

## Sécurité

L’application applique plusieurs protections :

- validation des entrées utilisateur
- protection XSS via nettoyage des chaînes
- contrôle de format email / téléphone / date / heure
- JWT sur les routes admin
- rate limiting sur login, réservations et ping
- CORS contrôlé
- Helmet pour les headers HTTP de sécurité

## Notes importantes

- Les réservations sont créées par des clients sans compte utilisateur.
- Les statuts possibles sont : `en_attente`, `accepte`, `rejete`.
- Les réservations en attente ou acceptées bloquent les créneaux concernés.
- La génération automatique de créneaux est prévue via une logique dédiée dans le projet, mais la logique principale est gérée via Supabase et l’admin.
- Le projet ne contient pas encore de suite de tests automatisés (`npm test` est actuellement non configuré).

## Déploiement

L’API est conçue pour être déployée sur des plateformes type Render, Railway, Fly.io, VPS Linux ou un conteneur Docker. Assurez-vous de configurer correctement les variables d’environnement et de sécuriser le `JWT_SECRET`.

## Licence

Projet interne / non documenté. Vérifier la licence de votre organisation avant mise en production.
