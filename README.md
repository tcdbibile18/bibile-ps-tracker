---
title: Bibile Pradeshiya Sabha Complaint Tracker
sdk: docker
app_port: 7860
---

# Bibile Pradeshiya Sabha Complaint Tracker

Use this repository as a Hugging Face Docker Space. Add `ADMIN_PASSWORD` as a Space secret for staff sign-in. The default username is `admin`. Set `COOKIE_SECURE` to `1` for the HTTPS deployment.

For a local Docker run:

```sh
docker build -t bibile-ps-tracker .
docker run --rm -p 7860:7860 -e ADMIN_PASSWORD bibile-ps-tracker
```

Set `ADMIN_PASSWORD` in your shell first if you need staff sign-in. The citizen portal is at `http://localhost:7860/`.

SQLite and uploaded photos are stored under `.data` by default. Use a persistent volume and configure `DATA_DIR` to a writable directory on that volume if the data must survive container replacement.
