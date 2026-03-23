import requests
import json
import re
import time

CAMARA = "http://192.168.163.216:3000"
OLLAMA = "http://localhost:11434/api/generate"

def obtenir_token():
    r = requests.post(
        CAMARA + "/oauth/token",
        data="grant_type=client_credentials&client_id=test&client_secret=test",
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    return r.json()["access_token"]


def verifier_statut_terminal(numero):
    token = obtenir_token()
    r = requests.post(
        CAMARA + "/device-reachability-status/v1/retrieve",
        json={"device": {"phoneNumber": numero}},
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        }
    )
    return r.json()

def creer_session_qos(numero, profil="QOS_L", duree=3600):
    token = obtenir_token()
    r = requests.post(
        CAMARA + "/quality-on-demand/v1/sessions",
        json={
            "device": {"phoneNumber": numero},
            "qosProfile": profil,
            "duration": duree
        },
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
        }
    )
    return r.json()

def supprimer_session_qos(session_id):
    token = obtenir_token()
    r = requests.delete(
        CAMARA + "/quality-on-demand/v1/sessions/" + session_id,
        headers={"Authorization": "Bearer " + token}
    )
    return r.status_code

def consulter_session_qos(session_id):
    token = obtenir_token()
    r = requests.get(
        CAMARA + "/quality-on-demand/v1/sessions/" + session_id,
        headers={"Authorization": "Bearer " + token}
    )
    return r.json()


def analyser_avec_llm(numero, statut_terminal):
    prompt = """je suis un agent IA de gestion de réseau télécom.

Une application critique a besoin d'un accès réseau prioritaire pour le numéro : """ + numero + """

Statut du terminal : """ + json.dumps(statut_terminal, indent=2) + """

Règles :
- Si reachabilityStatus = REACHABLE -> activer la QoS
- Si reachabilityStatus = UNREACHABLE -> ne pas activer, le terminal est hors ligne
- Choisir le profil QoS selon le besoin :
  * QOS_E = vidéo/voix temps réel (priorité maximale)
  * QOS_L = données haute priorité
  * QOS_M = priorité moyenne
  * QOS_S = basse priorité

Réponds UNIQUEMENT en JSON :
{
  "decision": "ACTIVER ou REJETER",
  "profilQos": "QOS_E ou QOS_L ou QOS_M ou QOS_S",
  "duree": 3600,
  "raison": "explication courte en français"
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

def analyser_reponse_llm(reponse):
    try:
        match = re.search(r'\{.*\}', reponse, re.DOTALL)
        if match:
            return json.loads(match.group())
    except:
        pass
    return {
        "decision": "REJETER",
        "profilQos": "QOS_L",
        "duree": 3600,
        "raison": "Erreur d'analyse - rejet par défaut"
    }

def executer_uc1(numero):
    print("=" * 55)
    print("UC1 - Boost de Connectivité Intelligent")
    print(f"Terminal : {numero}")
    print("=" * 55)

    debut = time.time()

    # Vérifier l'état du terminal
    print("\n[1] Vérification du statut terminal...")
    statut = verifier_statut_terminal(numero)
    print(f"    Statut     : {statut.get('reachabilityStatus')} ({statut.get('source')})")
    if statut.get('supi'):
        print(f"    SUPI       : {statut.get('supi')}")
    if statut.get('cmState'):
        print(f"    État CM    : {statut.get('cmState')}")

    # Décision de l'agent LLM
    print("\n[2] Analyse par l'agent IA...")
    reponse_brute = analyser_avec_llm(numero, statut)
    decision = analyser_reponse_llm(reponse_brute)
    print(f"    Décision   : {decision.get('decision')}")
    print(f"    Profil QoS : {decision.get('profilQos')}")
    print(f"    Raison     : {decision.get('raison')}")

    session = None

    # Activer la QoS si décision ACTIVER
    if decision.get('decision') == 'ACTIVER':
        print("\n[3] Activation de la session QoS...")
        session = creer_session_qos(
            numero,
            profil=decision.get('profilQos', 'QOS_L'),
            duree=decision.get('duree', 3600)
        )
        print(f"    Session ID : {session.get('sessionId')}")
        print(f"    Statut     : {session.get('status')}")
        print(f"    Expiration : {session.get('expiresAt')}")
    else:
        print("\n[3] Activation QoS REJETÉE - terminal non joignable")

    # Mesure latence
    latence = int((time.time() - debut) * 1000)

    print("\n" + "=" * 55)
    print("RÉSULTAT FINAL :")
    print("=" * 55)
    print(f"Décision   : {decision.get('decision')}")
    print(f"Latence    : {latence}ms (objectif < 500ms)")
    if latence < 500:
        print("Performance : OK")
    else:
        print("Performance : Trop lent - problème de latence LLM")

    # Simulation fin d'usage → suppression session
    if session and session.get('sessionId'):
        print("\n[4] Fin d'usage simulée - suppression session QoS...")
        code = supprimer_session_qos(session['sessionId'])
        print(f"    Session supprimée : HTTP {code}")

    return {
        "numero": numero,
        "statutTerminal": statut.get('reachabilityStatus'),
        "decision": decision.get('decision'),
        "profilQos": decision.get('profilQos'),
        "latenceMs": latence,
        "sessionId": session.get('sessionId') if session else None
    }

if __name__ == "__main__":
    resultat = executer_uc1("0900000000")
    print("\nRésultat final :")
    print(json.dumps(resultat, indent=2, ensure_ascii=False))
