# Five Nights at Freddy's (Browser Recreation)

A from-scratch browser recreation of the classic survival horror game. Survive until 6 AM.

## How to Play (No Install, No Admin)

1. **Double-click `index.html`** (or right-click → Open with → Chrome / Edge / Firefox).
2. The game runs in your browser. No server, no npm, no admin rights needed.
3. Choose a night (1–5). Night 1 is easiest; Night 5 is hardest.
4. **Survive until 6 AM** (about 5 real minutes per night).
5. **CAM** – Open the security camera tablet to watch the building.
6. **Left/Right door buttons** – Close or open the doors to block animatronics.
7. **Left/Right light buttons** – Hold to peek into the hallway (drains power).
8. **Power** – Limited. Doors and lights drain it. If power hits 0, you lose.

## Tips

- Close doors only when you hear or suspect an animatronic at that side.
- Check cameras to see where Freddy, Bonnie, Chica, and Foxy are.
- On later nights they move faster; save power and time your door usage.

## Optional: Run a Local Server

Only if you want a URL like `http://localhost:8000` (the game works fine without this):

- **Python** (if installed for your user):  
  `python -m http.server 8000`  
  Then open http://localhost:8000
- **Node/npm** (if you install Node for your user, e.g. from [nodejs.org](https://nodejs.org) or a portable zip):  
  `npx serve .`

No admin privileges required for any of the above.

---

## Push this project to your GitHub

**You need Git installed first.** Download: [git-scm.com](https://git-scm.com/download/win) (choose "64-bit Git for Windows"). Restart your terminal/Cursor after installing.

Then:

### 1. Create a new repo on GitHub

- Go to [github.com/new](https://github.com/new)
- Repository name: e.g. `fnaf` or `five-nights-freddy`
- Leave it **empty** (no README, no .gitignore)
- Click **Create repository**

### 2. In your project folder, run:

```bash
cd c:\Users\learnwell\Desktop\fnaf

git init
git add index.html styles.css game.js README.md .gitignore
git commit -m "Initial commit: FNAF browser game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username and `YOUR_REPO_NAME` with the repo name you chose (e.g. `fnaf`).  
When you run `git push`, Git will ask for your GitHub username and password; use a **Personal Access Token** as the password (Settings → Developer settings → Personal access tokens on GitHub).
