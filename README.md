# SMHB Handball — Application PWA

Application web progressive (PWA) de gestion du club SMHB Handball.
Fonctionne sur iOS, Android et tous les navigateurs.

---

## Structure du projet

```
smhb/
├── public/
│   ├── index.html          ← Application principale
│   ├── offline.html        ← Page hors ligne
│   ├── manifest.json       ← Configuration PWA
│   ├── sw.js               ← Service Worker (cache + push)
│   └── icons/              ← Icônes à créer (voir étape 3)
├── src/
│   ├── db.js               ← Couche Supabase (données)
│   ├── notifications.js    ← Push notifications
│   └── style.css           ← Styles globaux (optionnel)
└── supabase/
    └── schema.sql          ← Schéma base de données
```

---

## Déploiement en 6 étapes

### Étape 1 — Créer un compte Supabase (gratuit)

1. Allez sur https://supabase.com et créez un compte
2. Créez un nouveau projet (choisissez une région Europe)
3. Notez votre **Project URL** et votre **anon key** :
   - Dashboard → Settings → API

### Étape 2 — Créer la base de données

1. Dans Supabase Dashboard → **SQL Editor** → **New Query**
2. Copiez-collez tout le contenu de `supabase/schema.sql`
3. Cliquez **Run**
4. Vérifiez que les tables sont créées : Table Editor → vous devez voir
   `categories`, `profiles`, `events`, `registrations`, `notifications`, `parent_children`

### Étape 3 — Configurer l'application

Dans `public/index.html`, remplacez lignes ~200 :
```js
const SUPABASE_URL = 'https://VOTRE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';
```

Dans `src/db.js`, remplacez les mêmes constantes lignes 4-5.

### Étape 4 — Générer les clés VAPID (notifications push)

1. Allez sur https://vapidkeys.com/
2. Cliquez **Generate VAPID Keys**
3. Copiez la **Public Key** dans `src/notifications.js` :
   ```js
   const VAPID_PUBLIC_KEY = 'VOTRE_CLE_PUBLIQUE';
   ```
4. Dans Supabase → **Edge Functions** → **Secrets**, ajoutez :
   - `VAPID_PRIVATE_KEY` = votre clé privée
   - `VAPID_EMAIL` = `mailto:votre@email.com`

### Étape 5 — Générer les icônes PWA

Créez un dossier `public/icons/` et générez les icônes :
1. Allez sur https://realfavicongenerator.net/
2. Uploadez un logo SMHB (carré, fond jaune, lettres noires)
3. Téléchargez et placez dans `public/icons/` :
   - icon-72.png, icon-96.png, icon-128.png
   - icon-144.png, icon-192.png, icon-512.png

### Étape 6 — Déployer sur Vercel (gratuit)

**Option A — Via GitHub (recommandé) :**
1. Créez un repo GitHub et pushez ce dossier
2. Allez sur https://vercel.com → **New Project** → importez le repo
3. Configuration : **Output Directory** = `public`
4. Cliquez **Deploy**

**Option B — Via CLI :**
```bash
npm install -g vercel
cd smhb
vercel --public
# Répondez : Output directory = public
```

Votre app sera disponible sur `https://smhb-handball.vercel.app`

---

## Créer le premier compte coach

1. Ouvrez l'application déployée
2. Cliquez **Inscription**
3. Renseignez vos informations, choisissez le rôle **Joueur**
4. Dans Supabase → **Table Editor** → `profiles`
5. Trouvez votre ligne, changez `role` = `coach`
6. Reconnectez-vous → l'onglet Admin apparaît

> Pour les prochains coachs, vous pourrez le faire directement depuis l'interface.

---

## Fonctionnalités

| Fonctionnalité | Coach | Joueur | Parent |
|---|---|---|---|
| Voir le calendrier | ✅ | ✅ | ✅ |
| Voir les séances | ✅ | ✅ | ✅ |
| S'inscrire à une séance | — | ✅ | — |
| Inscrire son enfant | — | — | ✅ |
| Créer une séance | ✅ | — | — |
| Supprimer une séance | ✅ | — | — |
| Voir l'équipe | ✅ | ✅ | ✅ |
| Notifications push | ✅ | ✅ | ✅ |
| Filtrer par catégorie | ✅ | ✅ | ✅ |

## Catégories incluses

- **Seniors** (18+)
- **U18** (15-17 ans)
- **U15** (13-14 ans)
- **U13** (11-12 ans)

Pour ajouter une catégorie : Supabase → SQL Editor :
```sql
INSERT INTO categories (name, min_age, max_age, color)
VALUES ('U11', 9, 10, '#a855f7');
```

---

## Installation sur mobile

**iOS (iPhone/iPad) :**
1. Ouvrez Safari → votre URL
2. Bouton Partager → **"Sur l'écran d'accueil"**

**Android :**
1. Ouvrez Chrome → votre URL
2. Menu ⋮ → **"Ajouter à l'écran d'accueil"**
   (ou la bannière d'installation apparaît automatiquement)

---

## Support

Pour toute question sur le déploiement, consultez :
- Supabase Docs : https://supabase.com/docs
- Vercel Docs : https://vercel.com/docs
