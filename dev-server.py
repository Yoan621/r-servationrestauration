#!/usr/bin/env python3
"""Serveur local des pages mockup/ sans cache navigateur et proxy API (Zelty & Brevo).
Usage : python3 dev-server.py
"""
import functools, http.server, json, os, urllib.request, urllib.parse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MOCKUP_DIR = os.path.join(SCRIPT_DIR, "mockup")

def get_env_var(key, search_paths):
    for p in search_paths:
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(f"{key}="):
                        return line.split("=", 1)[1].strip("\"' ")
    return None

ZELTY_API_KEY = get_env_var("ZELTY_API_KEY", [
    os.path.join(SCRIPT_DIR, "server", ".env"),
    os.path.join(SCRIPT_DIR, "..", "10_Reporting", ".env")
])

BREVO_API_KEY = get_env_var("BREVO_API_KEY", [
    os.path.join(SCRIPT_DIR, "server", ".env"),
    os.path.join(SCRIPT_DIR, "..", "10_Reporting", ".env")
])

class DevServerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/zelty/check":
            self.handle_zelty_check(parsed)
            return
        if parsed.path == "/api/zelty/status":
            self.send_json(200, {"active": bool(ZELTY_API_KEY)})
            return
        if parsed.path == "/api/brevo/status":
            self.send_json(200, {"active": bool(BREVO_API_KEY)})
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/brevo/sms-avis":
            self.handle_brevo_sms_avis()
            return
        if parsed.path == "/api/zelty/create":
            self.handle_zelty_create()
            return
        self.send_error(404, "Not Found")

    def send_json(self, status, data):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def handle_zelty_check(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        phone = qs.get("phone", [""])[0].strip()
        email = qs.get("email", [""])[0].strip()
        query = phone or email

        if not ZELTY_API_KEY:
            self.send_json(503, {"error": "ZELTY_API_KEY manquant"})
            return

        if not query:
            self.send_json(400, {"error": "Paramètre phone ou email requis"})
            return

        try:
            # Nettoyer téléphone pour Zelty
            clean_q = query.replace(" ", "").replace(".", "").replace("-", "")
            req_url = f"https://api.zelty.fr/2.7/customers?search={urllib.parse.quote(clean_q)}"
            req = urllib.request.Request(req_url, headers={
                "Authorization": f"Bearer {ZELTY_API_KEY}",
                "Accept": "application/json"
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                customers = data.get("customers", [])
                self.send_json(200, {
                    "exists": len(customers) > 0,
                    "count": len(customers),
                    "customers": customers
                })
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_zelty_create(self):
        if not ZELTY_API_KEY:
            self.send_json(503, {"error": "ZELTY_API_KEY manquant"})
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

        name = body.get("nom", "").strip()
        fname = body.get("prenom", "").strip()
        phone = body.get("tel", "").strip()
        mail = body.get("email", "").strip()
        optin = bool(body.get("consentement", True))

        if not phone and not mail:
            self.send_json(400, {"error": "Téléphone ou email requis"})
            return

        payload = json.dumps({
            "name": name or "Client",
            "fname": fname,
            "phone": phone,
            "mail": mail,
            "sms_optin": optin,
            "mail_optin": optin
        }).encode("utf-8")

        try:
            req = urllib.request.Request("https://api.zelty.fr/2.7/customers", data=payload, headers={
                "Authorization": f"Bearer {ZELTY_API_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                self.send_json(200, {"success": True, "data": data})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_brevo_sms_avis(self):
        if not BREVO_API_KEY:
            self.send_json(503, {"error": "BREVO_API_KEY manquant"})
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

        tel = body.get("tel", "").strip()
        prenom = body.get("prenom", "").strip()
        restaurant = body.get("restaurant", "Perpignan").strip()

        if not tel:
            self.send_json(400, {"error": "Numéro de téléphone requis"})
            return

        # Format international FR +33
        clean_tel = tel.replace(" ", "").replace(".", "").replace("-", "")
        if clean_tel.startswith("0") and len(clean_tel) == 10:
            clean_tel = "+33" + clean_tel[1:]
        elif not clean_tel.startswith("+"):
            clean_tel = "+33" + clean_tel

        review_url = "https://g.page/r/Cd1Ia0YpCNfyEAE/review" if "montpellier" in restaurant.lower() else "https://g.page/r/CbTiWhN3LrtrEAE/review"
        content = f"Ciao {prenom} ! Merci d'avoir mange chez Fricaccia {restaurant}. Un avis Google en 30s ? Ca nous aide enormement : {review_url} Nonna"

        payload = json.dumps({
            "sender": "Fricaccia",
            "recipient": clean_tel,
            "content": content,
            "type": "marketing"
        }).encode("utf-8")

        try:
            req = urllib.request.Request("https://api.brevo.com/v3/transactionalSMS/sms", data=payload, headers={
                "api-key": BREVO_API_KEY,
                "Content-Type": "application/json",
                "Accept": "application/json"
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode())
                self.send_json(200, {"success": True, "data": data})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 8971), functools.partial(DevServerHandler, directory=MOCKUP_DIR))
    server.serve_forever()
