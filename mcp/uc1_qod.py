import requests
import json
import re
import time

CAMARA = "http://192.168.163.216:3000"
OLLAMA = "http://localhost:11434/api/generate"

# ── Helpers ───────────────────────────────────────────────────

def get_token():
    r = requests.post(
        CAMARA + "/oauth/token",
        data="grant_type=client_credentials&client_id=test&client_secret=test",
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    return r.json()["access_token"]

# ── APIs CAMARA ───────────────────────────────────────────────

def get_device_status(phone):
    token = get_token()
    r = requests.post(
        CAMARA + "/device-reachability-status/v1/retrieve",
        json={"device": {"phoneNumber": phone}},
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        }
    )
    return r.json()

def create_qod_session(phone, profile="QOS_L", duration=3600):
    token = get_token()
    r = requests.post(
        CAMARA + "/quality-on-demand/v1/sessions",
        json={
            "device": {"phoneNumber": phone},
            "qosProfile": profile,
            "duration": duration
        },
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        }
    )
    return r.json()

def delete_qod_session(session_id):
    token = get_token()
    r = requests.delete(
        CAMARA + "/quality-on-demand/v1/sessions/" + session_id,
        headers={"Authorization": "Bearer " + token}
    )
    return r.status_code

def get_qod_session(session_id):
    token = get_token()
    r = requests.get(
        CAMARA + "/quality-on-demand/v1/sessions/" + session_id,
        headers={"Authorization": "Bearer " + token}
    )
    return r.json()

# ── Agent LLM ─────────────────────────────────────────────────

def analyze_with_llm(phone, device_status):
    prompt = """You are a telecom AI agent managing network quality.

A critical application needs priority network access for phone: """ + phone + """

Device Status: """ + json.dumps(device_status, indent=2) + """

Rules:
- If reachabilityStatus = REACHABLE -> activate QoS
- If reachabilityStatus = UNREACHABLE -> do not activate, device is offline
- Choose QoS profile based on need:
  * QOS_E = real-time video/voice (highest priority)
  * QOS_L = high priority data
  * QOS_M = medium priority
  * QOS_S = low priority

Return ONLY JSON:
{
  "decision": "ACTIVATE or REJECT",
  "qosProfile": "QOS_E or QOS_L or QOS_M or QOS_S",
  "duration": 3600,
  "reason": "short explanation"
}"""

    r = requests.post(
        OLLAMA,
        json={
            "model": "llama3.2",
            "prompt": prompt,
            "stream": False
        }
    )
    return r.json()["response"]

def parse_llm_response(response):
    try:
        match = re.search(r'\{.*\}', response, re.DOTALL)
        if match:
            return json.loads(match.group())
    except:
        pass
    return {
        "decision": "REJECT",
        "qosProfile": "QOS_L",
        "duration": 3600,
        "reason": "Parse error — default REJECT"
    }

# ── UC1 Principal ─────────────────────────────────────────────

def run_uc1(phone):
    print("=" * 55)
    print("UC1 — Smart Connectivity Boost")
    print(f"Terminal : {phone}")
    print("=" * 55)

    start = time.time()

    # Étape 1 — Vérifier l'état du terminal
    print("\n[1] Checking device status...")
    device = get_device_status(phone)
    print(f"    Status : {device.get('reachabilityStatus')} ({device.get('source')})")

    # Étape 2 — Décision LLM
    print("\n[2] Agent analyzing context...")
    raw = analyze_with_llm(phone, device)
    decision = parse_llm_response(raw)
    print(f"    Decision  : {decision.get('decision')}")
    print(f"    QoS Profile : {decision.get('qosProfile')}")
    print(f"    Reason    : {decision.get('reason')}")

    session = None

    # Étape 3 — Activer la QoS si décision ACTIVATE
    if decision.get('decision') == 'ACTIVATE':
        print("\n[3] Activating QoS session...")
        session = create_qod_session(
            phone,
            profile=decision.get('qosProfile', 'QOS_L'),
            duration=decision.get('duration', 3600)
        )
        print(f"    Session ID : {session.get('sessionId')}")
        print(f"    Status     : {session.get('status')}")
        print(f"    Expires    : {session.get('expiresAt')}")
    else:
        print("\n[3] QoS activation REJECTED — device not reachable")

    # Mesure latence
    latency = int((time.time() - start) * 1000)

    print("\n" + "=" * 55)
    print("RESULT:")
    print("=" * 55)
    print(f"Decision : {decision.get('decision')}")
    print(f"Latency  : {latency}ms (target < 500ms)")
    if latency < 500:
        print("Performance : ✓ OK")
    else:
        print("Performance : ✗ Too slow")

    # Étape 4 — Simulation fin d'usage → suppression session
    if session and session.get('sessionId'):
        print("\n[4] Simulating end of usage — deleting session...")
        status = delete_qod_session(session['sessionId'])
        print(f"    Session deleted : HTTP {status}")

    return {
        "phone": phone,
        "deviceStatus": device.get('reachabilityStatus'),
        "decision": decision.get('decision'),
        "qosProfile": decision.get('qosProfile'),
        "latencyMs": latency,
        "sessionId": session.get('sessionId') if session else None
    }

if __name__ == "__main__":
    result = run_uc1("0900000000")
    print("\nFinal result:")
    print(json.dumps(result, indent=2))
