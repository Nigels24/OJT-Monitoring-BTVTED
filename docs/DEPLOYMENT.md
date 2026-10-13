# Setting up OJT-Track on the school's host computer

This guide sets up OJT-Track on **one computer inside the school**. That computer
(the "host computer") runs everything: the website, the database, and the
uploaded files. Phones and laptops on the school network or Wi-Fi open the
system in a browser by typing the host computer's address. Nothing is paid for
and nothing is stored outside the school.

You do not need to be a programmer. Follow the parts in order, type the
commands exactly as shown, and do not skip Part 8 (backups).

The instructions are written for **Windows** first. Where macOS or Linux is
different, there is a note marked **macOS/Linux**.

**Contents**

1. [What you need](#1-what-you-need)
2. [Install Node.js and PostgreSQL](#2-install-nodejs-and-postgresql)
3. [Create the database](#3-create-the-database)
4. [Put the system on the computer and fill in its settings](#4-put-the-system-on-the-computer-and-fill-in-its-settings)
5. [Install, prepare the database, and build](#5-install-prepare-the-database-and-build)
6. [Start it and try it](#6-start-it-and-try-it)
7. [Let other devices in: address and firewall](#7-let-other-devices-in-address-and-firewall)
8. [Daily backups](#8-daily-backups)
9. [Start automatically when the computer turns on](#9-start-automatically-when-the-computer-turns-on)
10. [Updating to a new version](#10-updating-to-a-new-version)
11. [Checking that it is healthy, and fixing common problems](#11-checking-that-it-is-healthy-and-fixing-common-problems)
12. [Settings reference](#12-settings-reference)

---

## 1. What you need

- A computer that stays on during school hours, connected to the school
  network (a cable is more reliable than Wi-Fi for the host computer).
- An administrator account on that computer.
- An **external drive** (USB hard drive or flash drive) for backups.
- Internet access during setup, to download Node.js, PostgreSQL and the
  system's packages. After setup the system works without internet, except
  for sending login emails.
- The OJT-Track folder (from the developer, or downloaded from the project's
  repository).

How the pieces fit together:

```
 phone / laptop                     the host computer
 on school Wi-Fi          ┌──────────────────────────────────────────┐
                          │  Website   (port 3001)  ← open in firewall│
  browser ───────────────►│     │ passes /api requests on            │
  http://<host-ip>:3001   │     ▼                                    │
                          │  API       (port 3000)  ← stays closed    │
                          │     │                                    │
                          │     ├─► PostgreSQL database (port 5432)  │
                          │     └─► uploaded files (a folder)        │
                          └──────────────────────────────────────────┘
```

Other devices only ever talk to the **website on port 3001**. The API and the
database are never opened to the network.

---

## 2. Install Node.js and PostgreSQL

### Node.js

1. Go to <https://nodejs.org> and download the **LTS** version (version 20 or
   newer) for Windows.
2. Run the installer and accept the defaults.
3. Open **Command Prompt** (press the Windows key, type `cmd`, press Enter) and
   check it worked:

   ```
   node --version
   npm --version
   ```

   Each should print a version number.

**macOS/Linux:** install the LTS version from <https://nodejs.org>, or with
your package manager. Use the **Terminal** app wherever this guide says Command
Prompt.

### PostgreSQL

1. Go to <https://www.postgresql.org/download/windows/> and download the
   installer (version 15 or newer).
2. Run it and accept the defaults. When it asks for a **password for the
   database superuser (postgres)**, choose one and **write it down** — you need
   it in Part 3.
3. Keep the port as **5432**.
4. You can untick "Stack Builder" at the end; it is not needed.

Note the folder PostgreSQL was installed in. Its `bin` folder is usually:

```
C:\Program Files\PostgreSQL\17\bin
```

(The number is the version you installed.) You will need this path in Part 4.

**macOS:** install from <https://postgresapp.com> or `brew install postgresql@17`.
**Linux (Debian/Ubuntu):** `sudo apt install postgresql postgresql-client`.

---

## 3. Create the database

OJT-Track gets its own database and its own database user, separate from the
`postgres` superuser.

1. Open the **SQL Shell (psql)** program that came with PostgreSQL (Windows
   key, type `psql`).
2. Press Enter four times to accept the defaults (server, database, port,
   username), then type the `postgres` password from Part 2.
3. Type these three lines, pressing Enter after each. **Replace
   `CHOOSE_A_PASSWORD`** with a password of your own made of letters and
   digits only (no `@ : / # ?` — those cause trouble later), and write it down.

   ```sql
   CREATE USER ojt_track WITH PASSWORD 'CHOOSE_A_PASSWORD';
   CREATE DATABASE ojt_track OWNER ojt_track;
   \q
   ```

**macOS/Linux:** open a terminal and run `psql -U postgres` (Linux:
`sudo -u postgres psql`), then type the same three lines.

---

## 4. Put the system on the computer and fill in its settings

### Where to put it

Copy the OJT-Track folder somewhere simple with no spaces in the path, for
example:

```
C:\ojt-track
```

The rest of this guide assumes that location. Inside it you will see `app`,
`docs`, `scripts` and a few files.

### The API's settings

1. Open the folder `C:\ojt-track\app\server`.
2. Make a copy of the file `.env.example` and name the copy **`.env`**
   (exactly that — a dot, then `env`, nothing else). If you cannot see file
   extensions, turn on *View → File name extensions* in File Explorer.
3. Open `.env` with **Notepad** and fill in these lines. Every line is
   explained inside the file itself.

   | Setting | What to put |
   | --- | --- |
   | `DATABASE_URL` | `postgresql://ojt_track:CHOOSE_A_PASSWORD@localhost:5432/ojt_track` — with the password from Part 3 |
   | `DIRECT_URL` | leave blank |
   | `JWT_SECRET` | a long random text — see below |
   | `FILE_URL_SECRET` | a second, different long random text |
   | `SEED_COORDINATOR_EMAIL` | the first coordinator's real email address |
   | `SEED_COORDINATOR_NAME` | the first coordinator's name |
   | `BACKUP_DIR` | a folder on the external drive, e.g. `E:\ojt-backups` |
   | `PG_BIN_DIR` | PostgreSQL's `bin` folder from Part 2, e.g. `C:\Program Files\PostgreSQL\17\bin` |

   To make a long random text, run this in Command Prompt and copy what it
   prints. Run it twice — once for `JWT_SECRET`, once for `FILE_URL_SECRET`:

   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Leave everything else as it is for now. `APP_PUBLIC_URL` and the email
   settings are filled in at the end of Part 7.

4. Save and close.

> **Keep `.env` private.** It holds the database password and the secrets that
> protect every login. Do not email it or copy it to shared folders.

### The website's settings

1. Open the folder `C:\ojt-track\app\client`.
2. Make a copy of `.env.example` and name the copy **`.env`**.
3. You do not need to change anything in it.

---

## 5. Install, prepare the database, and build

Open Command Prompt and go to the OJT-Track folder:

```
cd C:\ojt-track
```

Then run these four commands **one at a time**, waiting for each to finish.
The first and last take a few minutes.

```
npm run setup
```
Downloads the packages both programs need.

```
npm run db:deploy
```
Creates all the tables in the database. It should end with *"All migrations
have been successfully applied."*

```
npm run seed
```
Creates the first coordinator accounts. **Look at what it prints**: it shows
each account's username, email and a **temporary password, once only**. Write
them down now — they are not shown again. (If you lose one, see
*"A coordinator is locked out"* in Part 11.)

```
npm run build:all
```
Prepares both programs to run.

---

## 6. Start it and try it

Still in `C:\ojt-track`:

```
npm run start:lan
```

After a few seconds it prints the addresses the system can be opened at:

```
OJT-Track is starting.
  On this computer:      http://localhost:3001
  From other devices:    http://192.168.1.10:3001
```

1. On the host computer, open a browser and go to **http://localhost:3001**.
2. Sign in with the coordinator username and temporary password from Part 5.
   You will be asked to choose a new password.

Leave the Command Prompt window open — closing it, or pressing **Ctrl+C**,
stops the system. Part 9 makes it start by itself so no window is needed.

The first time, Windows may ask whether to allow Node.js through the firewall.
You can click **Cancel**; Part 7 sets the firewall up properly.

---

## 7. Let other devices in: address and firewall

### Find the host computer's address

In a new Command Prompt window:

```
ipconfig
```

Look for **IPv4 Address** under the network you are connected to (Ethernet or
Wi-Fi). It looks like `192.168.1.10`. That number is the host computer's
address on the school network.

**macOS:** *System Settings → Network*, or `ipconfig getifaddr en0`.
**Linux:** `hostname -I`.

Other devices open the system at:

```
http://<that address>:3001          for example  http://192.168.1.10:3001
```

### Make the address permanent

By default a router may hand the computer a **different address** after a
restart, and everyone's saved link would stop working. Prevent that in one of
two ways. The first is better.

**Option A — reserve the address on the school router (recommended).**
Ask whoever manages the school's router or network to add a *DHCP reservation*
(sometimes called a *static lease* or *address reservation*) for the host
computer. They will need its *physical (MAC) address*, which `ipconfig /all`
shows as **Physical Address**. The router then always gives this computer the
same address.

**Option B — set a fixed address on the computer itself.**
*Settings → Network & Internet →* your connection *→ IP assignment → Edit →
Manual → IPv4 on*, then enter:

- **IP address:** an address outside the range the router hands out (ask the
  network administrator; using one already in use causes conflicts)
- **Subnet mask**, **Gateway**, **DNS:** the same values `ipconfig /all`
  currently shows

**If the address does change anyway**, the system keeps working — nothing has
to be rebuilt or reinstalled. People simply use the new address, and you
update `APP_PUBLIC_URL` (below) and restart.

### Open the firewall for the website only

Windows blocks other devices until you allow them. Open **port 3001** — and
only that port.

1. Press the Windows key, type **Windows Defender Firewall with Advanced
   Security**, and open it.
2. Click **Inbound Rules**, then **New Rule…** on the right.
3. Choose **Port** → Next.
4. Choose **TCP**, and in *Specific local ports* type **3001** → Next.
5. Choose **Allow the connection** → Next.
6. Tick **Private** and **Domain**; **untick Public** → Next.
7. Name it `OJT-Track website` → Finish.

Or, in a Command Prompt opened with *Run as administrator*:

```
netsh advfirewall firewall add rule name="OJT-Track website" dir=in action=allow protocol=TCP localport=3001 profile=private,domain
```

**Do not open ports 3000 or 5432.** The API (3000) and the database (5432) are
only used from inside the host computer; the website passes requests on to
them. Leaving them closed is part of what keeps the system safe.

If the network shows as **Public** in *Settings → Network & Internet*, change
it to **Private** — otherwise the rule above does not apply.

**macOS:** *System Settings → Network → Firewall*; if it is on, allow incoming
connections for `node` when asked. **Linux (ufw):** `sudo ufw allow 3001/tcp`.

### Tell the system its own address (for emails)

1. Open `C:\ojt-track\app\server\.env` in Notepad.
2. Set `APP_PUBLIC_URL` to the address from above:

   ```
   APP_PUBLIC_URL=http://192.168.1.10:3001
   ```

3. Optional — to email new users their login details, fill in `MAIL_ENABLED`,
   `GMAIL_USER` and `GMAIL_APP_PASSWORD` as described in the file. Without
   them, the coordinator is shown each temporary password on screen instead.
4. Save, then stop the system (Ctrl+C) and start it again (`npm run start:lan`).

### Try it from another device

On a phone or laptop connected to the **same school network**, open
`http://<host address>:3001` and sign in. Try uploading a document or a
journal photo and opening it again.

If it does not load, see Part 11.

---

## 8. Daily backups

A backup is a copy of **the database and every uploaded file**. If the host
computer's disk fails and there is no backup, everything is lost. Set this up
before real use begins.

### Make one backup by hand

1. Plug in the external drive and check its drive letter (for example `E:`).
2. Make sure `BACKUP_DIR` in `app\server\.env` points at a folder on it, e.g.
   `BACKUP_DIR=E:\ojt-backups`, and `PG_BIN_DIR` is set (Part 4).
3. Run:

   ```
   cd C:\ojt-track
   npm run backup
   ```

It prints a summary and creates a dated folder:

```
E:\ojt-backups\
  ojt-track_2026-10-13_1830\
    database.dump        the whole database
    storage\             every uploaded file
```

The newest **30** backups are kept; older ones are deleted automatically. The
system can stay running while a backup is made.

If it prints **BACKUP FAILED**, read the message — the usual causes are the
external drive not being plugged in, or `PG_BIN_DIR` being wrong.

### Run it automatically every day (Windows Task Scheduler)

1. Press the Windows key, type **Task Scheduler**, open it.
2. Click **Create Basic Task…**. Name: `OJT-Track daily backup` → Next.
3. Trigger: **Daily** → Next. Pick a time when the computer is on but quiet
   (for example 12:30 PM or 5:30 PM) → Next.
4. Action: **Start a program** → Next.
5. Fill in:
   - **Program/script:** `cmd`
   - **Add arguments:** `/c npm run backup >> backup.log 2>&1`
   - **Start in:** `C:\ojt-track`
6. Finish. Then right-click the task → **Properties** → tick **Run whether
   user is logged on or not**, and on the *Settings* tab tick **Run task as
   soon as possible after a scheduled start is missed**.

Each run adds its summary to `C:\ojt-track\backup.log`. **Look at that file
once a week** and check the latest entry says *Backup complete*. A backup
nobody checks is not a backup.

The external drive must be plugged in at the scheduled time.

**macOS/Linux (cron):** run `crontab -e` and add (5:30 PM every day):

```
30 17 * * * cd /path/to/ojt-track && npm run backup >> backup.log 2>&1
```

### Restoring from a backup

Restoring **replaces everything currently in the system** with what is in the
backup. Anything entered after that backup was made is lost. Only do this to
recover from a real loss (or onto a replacement computer).

1. **Stop the system** (Ctrl+C in its window, or `pm2 stop all` if you use PM2).
2. List the backups:

   ```
   cd C:\ojt-track
   npm run restore
   ```

3. Restore the one you want:

   ```
   npm run restore -- ojt-track_2026-10-13_1830
   ```

4. It shows what will be replaced and asks you to **type the backup's name
   again** to confirm. Pressing Enter cancels with nothing changed.
5. Start the system again.

The uploaded files that were there before the restore are not deleted: they
are kept beside the storage folder as `storage.before-restore-…`. Delete that
folder by hand once you have checked the restore is good.

**Moving to a replacement computer:** do Parts 2–5 on the new computer
(skipping `npm run seed`), copy the old `.env` files across, then restore the
latest backup as above.

---

## 9. Start automatically when the computer turns on

So far the system only runs while its Command Prompt window is open. Choose
**one** of these so it starts by itself after a restart or power cut.

### Option A — PM2 (recommended)

PM2 is a free program that keeps the system running and restarts it if it
crashes. It is installed on the computer itself, not into OJT-Track.

In a Command Prompt opened with **Run as administrator**:

```
npm install -g pm2 pm2-windows-startup
cd C:\ojt-track
pm2 start ecosystem.config.cjs
pm2 save
pm2-startup install
```

That starts both programs now and again at every boot. Useful commands:

| Command | What it does |
| --- | --- |
| `pm2 status` | shows whether `ojt-api` and `ojt-web` are running |
| `pm2 logs` | shows their messages (Ctrl+C to leave) |
| `pm2 restart all` | restarts both — do this after editing a `.env` file |
| `pm2 stop all` | stops both |

**macOS/Linux:** `npm install -g pm2`, then `pm2 start ecosystem.config.cjs`,
`pm2 save`, and `pm2 startup` — which prints one more command for you to copy
and run.

### Option B — Windows Task Scheduler (nothing extra to install)

1. Open **Task Scheduler** → **Create Task…** (not "Basic").
2. *General:* name `OJT-Track`; tick **Run whether user is logged on or not**.
3. *Triggers:* New → **At startup**; set *Delay task for* **1 minute** (gives
   PostgreSQL time to start).
4. *Actions:* New → **Start a program**:
   - **Program/script:** `cmd`
   - **Add arguments:** `/c npm run start:lan >> ojt-track.log 2>&1`
   - **Start in:** `C:\ojt-track`
5. *Settings:* untick **Stop the task if it runs longer than**.
6. OK, and enter the account's password when asked.

With this option the system is not restarted automatically if it crashes;
restart the computer, or run the task again from Task Scheduler.

PostgreSQL itself already starts automatically on Windows (it is installed as
a service).

---

## 10. Updating to a new version

1. **Make a backup first:** `npm run backup`.
2. Stop the system (`pm2 stop all`, or Ctrl+C in its window).
3. Replace the OJT-Track files with the new version — **but keep these**, which
   are your data and settings and are not part of any version:
   - `app\server\.env`
   - `app\client\.env`
   - `app\server\storage\` (the uploaded files)

   If the folder was set up with Git, `git pull` does this safely.
4. In `C:\ojt-track`, run:

   ```
   npm run setup
   npm run db:deploy
   npm run build:all
   ```

   (Not `npm run seed` — the accounts already exist.)
5. Start it again (`pm2 restart all`, or `npm run start:lan`).
6. Check it: `npm run health`.

If the release notes mention a new setting, add it to the `.env` file; the
`.env.example` beside it always lists every setting with an explanation.

---

## 11. Checking that it is healthy, and fixing common problems

### The health check

On the host computer, with the system running:

```
cd C:\ojt-track
npm run health
```

```
Website:   running
API:       running
Database:  connected
Files:     stored with the "local" driver
```

The same information is available in any browser on the network at
`http://<host address>:3001/api/health`. A healthy system answers:

```
{"status":"ok","database":true,"storage":"local"}
```

### Common problems

**Other devices cannot open the site, but the host computer can.**
- Is the device on the same network as the host computer (not mobile data,
  not a separate "guest" Wi-Fi)?
- Is the firewall rule for port 3001 in place, and is the network set to
  **Private** (Part 7)?
- Has the host computer's address changed? Run `ipconfig` again.
- Some school Wi-Fi networks block devices from talking to each other
  ("client isolation" / "AP isolation"). Ask the network administrator to
  allow access to the host computer, or connect it and the users to a network
  without that setting.

**"The system's server is not responding."**
The website is running but the API is not. Run `npm run health`. Look at the
API's messages (`pm2 logs ojt-api`, or the Command Prompt window) — the reason
it stopped is printed there. The most common causes are a missing `JWT_SECRET`
or a wrong `DATABASE_URL` in `app\server\.env`.

**`Database: NOT REACHABLE`.**
PostgreSQL is not running, or the password in `DATABASE_URL` is wrong. On
Windows, open **Services**, find `postgresql-x64-…`, and start it.

**Uploaded files show as "unavailable".**
The file is not in the storage folder. Check `STORAGE_DIR` in
`app\server\.env` has not been changed, and that the folder
(`app\server\storage` by default) still exists.

**A file link says it has expired.**
Links to files work for one hour. Reload the page to get a fresh one.

**A coordinator is locked out.**
Coordinators reset everyone else's login from inside the system, but nobody
inside can reset theirs. On the host computer:

```
cd C:\ojt-track\app\server
npm run reset-coordinator
```

It prints a new temporary password. If there is more than one coordinator, it
lists them and asks you to say which one — give a new password of at least 8
characters followed by their username or email:

```
npm run reset-coordinator -- "a-new-password" coordinator2
```

**Port 3001 (or 3000) is "already in use".**
The system is already running — probably started by PM2 or Task Scheduler. Do
not start it a second time.

**Login emails are not arriving.**
Emails need internet access and a correct `GMAIL_APP_PASSWORD`. The coordinator
sees the reason in the *Login email* column, and is shown the temporary
password on screen instead, so nobody is stuck.

### Moving existing files from Supabase (one time, only if you used it before)

If this system previously stored its files in Supabase, copy them down once:
put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `app\server\.env`, then:

```
cd C:\ojt-track\app\server
npm run storage:pull
```

It copies every file into the storage folder, skips any already there, and
prints a count. It can be run again safely. Afterwards the two Supabase lines
can be removed.

---

## 12. Settings reference

Every setting is also explained inside the `.env.example` file it belongs to.

### `app/server/.env`

| Setting | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | Where the PostgreSQL database is. |
| `DIRECT_URL` | same as `DATABASE_URL` | Leave blank for a database on this computer. |
| `JWT_SECRET` | *(required)* | Signs every login. The API will not start without it. |
| `PORT` | `3000` | The API's port. Stays closed in the firewall. |
| `HOST` | `0.0.0.0` | The address the API listens on. |
| `CORS_ORIGINS` | `http://localhost:3001` | Websites allowed to call the API directly. Not needed normally. |
| `STORAGE_DRIVER` | `local` | `local` (a folder on this computer) or `supabase`. |
| `STORAGE_DIR` | `app/server/storage` | The folder for uploaded files. |
| `FILE_URL_SECRET` | falls back to `JWT_SECRET` | Signs the one-hour links to uploaded files. |
| `FILE_URL_BASE` | `/api` | What a file link starts with. Leave blank. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | blank | Only for `STORAGE_DRIVER=supabase` or `storage:pull`. |
| `SEED_COORDINATOR_EMAIL` / `_NAME` / `_USERNAME` | `coordinator@wphi.edu` / `Admin Coordinator` / `coordinator` | The first coordinator, created by `npm run seed`. |
| `SEED_COORDINATOR_PASSWORD` | blank (a password is generated) | Leave blank. |
| `SEED_COORDINATOR2_EMAIL` / `_NAME` / `_USERNAME` | `coordinator2@wphi.edu` / `Block B Coordinator` / `coordinator2` | The second coordinator. |
| `MAIL_ENABLED` | `false` | `true` to email login details. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME` | blank | The Gmail account emails are sent from. |
| `APP_PUBLIC_URL` | blank | The website's address, e.g. `http://192.168.1.10:3001`. Used in emails. |
| `BACKUP_DIR` | *(required for backups)* | The folder backups are written to. |
| `PG_BIN_DIR` | blank (looks on PATH) | PostgreSQL's `bin` folder. Needed on Windows. |

### `app/client/.env`

| Setting | Default | Meaning |
| --- | --- | --- |
| `API_INTERNAL_URL` | `http://127.0.0.1:3000` | Where the website reaches the API, on this computer. Read at start — no rebuild. |
| `NEXT_PUBLIC_API_URL` | blank | Leave blank. Development only. |

### Commands (run in the top `ojt-track` folder)

| Command | What it does |
| --- | --- |
| `npm run setup` | Installs the packages for both programs. |
| `npm run db:deploy` | Creates or updates the database tables. |
| `npm run seed` | Creates the first coordinator accounts (safe to run again). |
| `npm run build:all` | Builds both programs. |
| `npm run start:lan` | Starts both programs for the school network. |
| `npm run health` | Checks the website, API and database. |
| `npm run backup` | Backs up the database and uploaded files. |
| `npm run restore` | Lists backups; with a name, restores one. |
