"""Добавляет категории событий через API локального бэкенда (localhost:8000).
Входит как platform@test.kz. Повторный запуск безопасен: существующие пропускаются."""
import json
import urllib.error
import urllib.parse
import urllib.request

API = "http://localhost:8000"
CATEGORIES = [
    ("Music", "music"), ("Conferences", "conferences"), ("Technology", "technology"),
    ("Sports", "sports"), ("Theatre", "theatre"), ("Education", "education"),
    ("Business", "business"), ("Art", "art"), ("Food & drink", "food-drink"),
    ("Festivals", "festivals"),
]

def call(method, path, body=None, token=None, form=False):
    data = None
    headers = {}
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")

token = call("POST", "/auth/token", {"username": "platform@test.kz", "password": "TestPass123!"}, form=True)["access_token"]
have = {c["slug"] for c in call("GET", "/categories")}
added = 0
for name, slug in CATEGORIES:
    if slug in have:
        continue
    call("POST", "/admin/categories", {"name": name, "slug": slug}, token=token)
    added += 1
print(f"Добавлено категорий: {added}. Всего теперь: {len(call('GET', '/categories'))}")
