#!/usr/bin/env python3
import json
import threading
import time
from collections import deque
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


HOST = "0.0.0.0"
PORT = 8787
API_PREFIX = "/api/broadcast"
KNOWN_SERVERS = {"ogrest", "rubilax", "pandora"}
TRIBE_NOTICE_DURATION_MS = 30 * 60 * 1000
EVENT_RETENTION_MS = 12 * 60 * 60 * 1000
PRESENCE_TIMEOUT_MS = 90 * 1000
MAX_EVENTS_PER_SERVER = 4000
MAX_RECORDS_PER_SERVER = 300


state_lock = threading.Lock()


def now_ms():
    return int(time.time() * 1000)


def normalize_server_key(value):
    normalized = str(value or "").strip().lower()
    if normalized in KNOWN_SERVERS:
        return normalized
    return "ogrest"


def normalize_tribe_name(value):
    text = str(value or "").strip()
    for prefix in (
        "\u90e8\u65cf\uff1a",
        "\u90e8\u65cf:",
        "\u5408\u4f5c\uff1a",
        "\u5408\u4f5c:",
    ):
        if text.startswith(prefix):
            text = text[len(prefix) :].strip()
    return " ".join(text.split())


def tribe_key(name):
    return normalize_tribe_name(name).lower()


def create_server_state():
    return {
        "tribes": {},
        "event_log": deque(),
        "presence": {},
        "cursor": 0,
    }


ledger = {server_key: create_server_state() for server_key in KNOWN_SERVERS}


def make_record(raw, fallback_server=None):
    name = normalize_tribe_name(raw.get("name") or raw.get("challengeName") or "")
    key = str(raw.get("key") or tribe_key(name)).strip().lower()
    if not name or not key:
        return None

    activated_at = int(raw.get("activatedAt") or raw.get("detectedAt") or now_ms())
    ended_at = int(raw.get("endedAt") or 0)
    updated_at = int(raw.get("updatedAt") or max(activated_at, ended_at, now_ms()))
    server_key = normalize_server_key(raw.get("serverKey") or fallback_server)

    return {
        "key": key,
        "serverKey": server_key,
        "name": name,
        "challengeId": str(raw.get("challengeId") or ""),
        "activatedAt": activated_at,
        "expiresAt": int(raw.get("expiresAt") or (activated_at + TRIBE_NOTICE_DURATION_MS)),
        "updatedAt": updated_at,
        "endedAt": ended_at,
        "senderClientId": str(raw.get("senderClientId") or raw.get("clientId") or ""),
    }


def record_is_ended(record):
    return int(record.get("endedAt") or 0) > 0


def records_share_window(left, right):
    left_start = int(left.get("activatedAt") or 0)
    right_start = int(right.get("activatedAt") or 0)
    left_end = int(left.get("expiresAt") or (left_start + TRIBE_NOTICE_DURATION_MS))
    right_end = int(right.get("expiresAt") or (right_start + TRIBE_NOTICE_DURATION_MS))
    return left_start <= right_end and right_start <= left_end


def cleanup_server_state(server_key):
    server_state = ledger[server_key]
    cutoff = now_ms() - EVENT_RETENTION_MS

    expired_clients = [
        client_id
        for client_id, updated_at in server_state["presence"].items()
        if int(updated_at or 0) < now_ms() - PRESENCE_TIMEOUT_MS
    ]
    for client_id in expired_clients:
        server_state["presence"].pop(client_id, None)

    stale_keys = [
        key
        for key, record in server_state["tribes"].items()
        if int(record.get("updatedAt") or 0) < cutoff
    ]
    for key in stale_keys:
        server_state["tribes"].pop(key, None)

    while server_state["event_log"] and int(server_state["event_log"][0]["createdAt"]) < cutoff:
        server_state["event_log"].popleft()

    while len(server_state["event_log"]) > MAX_EVENTS_PER_SERVER:
        server_state["event_log"].popleft()

    if len(server_state["tribes"]) > MAX_RECORDS_PER_SERVER:
        sorted_records = sorted(
            server_state["tribes"].values(),
            key=lambda record: int(record.get("updatedAt") or 0),
            reverse=True,
        )[:MAX_RECORDS_PER_SERVER]
        server_state["tribes"] = {record["key"]: record for record in sorted_records}


def append_event(server_key, event_type, record=None):
    server_state = ledger[server_key]
    server_state["cursor"] += 1
    event = {
        "cursor": server_state["cursor"],
        "type": event_type,
        "serverKey": server_key,
        "createdAt": now_ms(),
    }
    if record is not None:
        event["record"] = deepcopy(record)
    server_state["event_log"].append(event)
    cleanup_server_state(server_key)
    return event


def get_online_count(server_key):
    cleanup_server_state(server_key)
    return max(1, len(ledger[server_key]["presence"]))


def build_snapshot(server_key):
    cleanup_server_state(server_key)
    server_state = ledger[server_key]
    return {
        "ok": True,
        "serverKey": server_key,
        "cursor": server_state["cursor"],
        "onlineCount": get_online_count(server_key),
        "state": {
            "servers": {
                server_key: {
                    "tribes": deepcopy(server_state["tribes"]),
                }
            }
        },
    }


def build_updates(server_key, since_cursor):
    cleanup_server_state(server_key)
    server_state = ledger[server_key]
    events = [deepcopy(event) for event in server_state["event_log"] if int(event["cursor"]) > since_cursor]
    events.append(
        {
            "type": "presence-summary",
            "serverKey": server_key,
            "onlineCount": get_online_count(server_key),
        }
    )
    return {
        "ok": True,
        "serverKey": server_key,
        "cursor": server_state["cursor"],
        "onlineCount": get_online_count(server_key),
        "events": events,
    }


def heartbeat(client_id, server_key):
    cleanup_server_state(server_key)
    ledger[server_key]["presence"][client_id] = now_ms()
    return {
        "ok": True,
        "serverKey": server_key,
        "cursor": ledger[server_key]["cursor"],
        "onlineCount": get_online_count(server_key),
    }


def publish_record(record):
    server_key = normalize_server_key(record.get("serverKey"))
    cleanup_server_state(server_key)
    server_state = ledger[server_key]
    existing = server_state["tribes"].get(record["key"])

    if existing and records_share_window(existing, record) and not record_is_ended(existing):
        return {
            "ok": True,
            "deduped": True,
            "serverKey": server_key,
            "cursor": server_state["cursor"],
            "onlineCount": get_online_count(server_key),
            "record": deepcopy(existing),
        }

    server_state["tribes"][record["key"]] = deepcopy(record)
    event = append_event(server_key, "tribe-upsert", record)
    return {
        "ok": True,
        "deduped": False,
        "serverKey": server_key,
        "cursor": event["cursor"],
        "onlineCount": get_online_count(server_key),
        "record": deepcopy(record),
    }


def end_record(payload):
    server_key = normalize_server_key(payload.get("serverKey"))
    cleanup_server_state(server_key)
    server_state = ledger[server_key]

    key = str(payload.get("key") or tribe_key(payload.get("challengeName") or payload.get("name") or "")).strip().lower()
    if not key:
        return {
            "ok": False,
            "error": "Missing tribe key.",
            "status": 400,
        }

    existing = server_state["tribes"].get(key)
    if not existing:
        return {
            "ok": False,
            "error": "Tribe record not found.",
            "status": 404,
        }

    resolved_at = int(payload.get("resolvedAt") or now_ms())
    updated = deepcopy(existing)
    updated["endedAt"] = resolved_at
    updated["updatedAt"] = max(int(updated.get("updatedAt") or 0), resolved_at)
    if payload.get("senderClientId") or payload.get("clientId"):
        updated["senderClientId"] = str(payload.get("senderClientId") or payload.get("clientId"))
    server_state["tribes"][key] = updated
    event = append_event(server_key, "tribe-end", updated)

    return {
        "ok": True,
        "serverKey": server_key,
        "cursor": event["cursor"],
        "onlineCount": get_online_count(server_key),
        "record": deepcopy(updated),
    }


def parse_json_body(handler):
    content_length = int(handler.headers.get("Content-Length") or 0)
    if content_length <= 0:
        return {}
    raw = handler.rfile.read(content_length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


class BroadcastHandler(BaseHTTPRequestHandler):
    server_version = "WakfuBroadcastHTTP/1.0"

    def _set_headers(self, status=200, extra_headers=None):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()

    def _write_json(self, payload, status=200):
        self._set_headers(status)
        self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == f"{API_PREFIX}/health":
            with state_lock:
                for server_key in KNOWN_SERVERS:
                    cleanup_server_state(server_key)
                payload = {
                    "ok": True,
                    "onlineCount": sum(max(0, len(ledger[server_key]["presence"])) for server_key in KNOWN_SERVERS),
                    "servers": {
                        server_key: {
                            "onlineCount": get_online_count(server_key),
                            "tribes": len(ledger[server_key]["tribes"]),
                            "cursor": ledger[server_key]["cursor"],
                        }
                        for server_key in sorted(KNOWN_SERVERS)
                    },
                }
            self._write_json(payload)
            return

        if parsed.path == f"{API_PREFIX}/tribes/snapshot":
            server_key = normalize_server_key(query.get("server", ["ogrest"])[0])
            with state_lock:
                payload = build_snapshot(server_key)
            self._write_json(payload)
            return

        if parsed.path == f"{API_PREFIX}/tribes/updates":
            server_key = normalize_server_key(query.get("server", ["ogrest"])[0])
            since_cursor = int(query.get("since", ["0"])[0] or 0)
            with state_lock:
                payload = build_updates(server_key, since_cursor)
            self._write_json(payload)
            return

        self._write_json({"ok": False, "error": "Not found."}, status=404)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            payload = parse_json_body(self)
        except Exception:
            self._write_json({"ok": False, "error": "Invalid JSON body."}, status=400)
            return

        if parsed.path == f"{API_PREFIX}/presence/heartbeat":
            client_id = str(payload.get("clientId") or "").strip()
            if not client_id:
                self._write_json({"ok": False, "error": "Missing clientId."}, status=400)
                return
            server_key = normalize_server_key(payload.get("serverKey"))
            with state_lock:
                response = heartbeat(client_id, server_key)
            self._write_json(response)
            return

        if parsed.path == f"{API_PREFIX}/tribes/publish":
            raw_record = payload.get("record") if isinstance(payload.get("record"), dict) else payload
            record = make_record(
                {
                    **raw_record,
                    "senderClientId": raw_record.get("senderClientId") or payload.get("clientId") or "",
                },
                raw_record.get("serverKey") or payload.get("serverKey"),
            )
            if not record:
                self._write_json({"ok": False, "error": "Missing tribe name."}, status=400)
                return
            with state_lock:
                response = publish_record(record)
            self._write_json(response)
            return

        if parsed.path == f"{API_PREFIX}/tribes/end":
            with state_lock:
                response = end_record(payload)
            self._write_json(response, status=response.pop("status", 200))
            return

        self._write_json({"ok": False, "error": "Not found."}, status=404)


def run():
    server = ThreadingHTTPServer((HOST, PORT), BroadcastHandler)
    print(f"Listening on http://{HOST}:{PORT}{API_PREFIX}")
    server.serve_forever()


if __name__ == "__main__":
    run()
