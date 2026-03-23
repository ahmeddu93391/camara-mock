#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json
import re
import time

# CONFIGURATION
CAMARA = "http://192.168.163.216:3000"  # VM CAMARA
OLLAMA = "http://localhost:11434/api/generate"  # LLM local
CLIENT_ID = "test"
CLIENT_SECRET = "test"
DEFAULT_5QI = 9
TIMEOUT_REQUEST = 3  # secondes pour HTTP

CORRESPONDANCE_5QI = {
    1: {"profil": "QOS_E", "description": "Voix temps réel"},
    2: {"profil": "QOS_E", "description": "Vidéo temps réel"},
    3: {"profil": "QOS_E", "description": "Jeu temps réel"},
    4: {"profil": "QOS_L", "description": "Jeu en ligne"},
    5: {"profil": "QOS_L", "description": "IMS signalisation"},
    6: {"profil": "QOS_L", "description": "Streaming live"},
    7: {"profil": "QOS_L", "description": "Voix interactive"},
    8: {"profil": "QOS_S", "description": "Téléchargement"},
    9: {"profil": "QOS_M", "description": "Navigation web"},
}

def obtenir_token_camara():
    try:
        resp = requests.post(
            CAMARA + "/oauth/token",
            data={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET},
            timeout=TIMEOUT_REQUEST
        )
        resp.raise_for_status()
        return resp.json()["access_token"]
    except Exception as e:
        print("[Erreur] Impossible d'obtenir un token CAMARA:", e)
        return None

def verifier_statut_terminal(numero, token):
    try:
        r = requests.post(
            CAMARA + "/device-reachability-status/v1/retrieve",
            json={"device": {"phoneNumber": numero}},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=TIMEOUT_REQUEST
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[Erreur] Impossible de vérifier le terminal {numero}:", e)
        return {"reachabilityStatus": "UNREACHABLE", "cmState": None, "source": "CAMARA"}

def obtenir_profile_qod(numero, token):
    try:
        r = requests.get(
            CAMARA + f"/quality-on-demand/v1/profiles/{numero}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT_REQUEST
        )
        r.raise_for_status()
        profile = r.json()
        fiveQI = profile.get("5qi")
        if fiveQI is None:  # Si CAMARA ne renvoie pas de 5QI, on passe par NRF → UDR
            print(f"[Info] CAMARA ne renvoie pas de 5QI pour {numero}, récupération via NRF...")
            # Token NRF pour UDR
            token_nrf = requests.post(
                NRF + "/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "nfInstanceId": NEF_ID,
                    "nfType": "NEF",
                    "targetNfType": "UDR",
                    "scope": "nudr-dr",
                    "requesterPlmn": '{"mcc":"208","mnc":"93"}'
                },
                timeout=TIMEOUT_REQUEST
            ).json().get("access_token")

            token_udm = requests.post(
                NRF + "/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "nfInstanceId": NEF_ID,
                    "nfType": "NEF",
                    "targetNfType": "UDM",
                    "scope": "nudm-sdm",
                    "requesterPlmn": '{"mcc":"208","mnc":"93"}'
                },
                timeout=TIMEOUT_REQUEST
            ).json().get("access_token")

            r_supi = requests.get(
                f"{UDM}/nudm-sdm/v2/msisdn-{numero}/id-translation-result",
                headers={"Authorization": f"Bearer {token_udm}"},
                timeout=TIMEOUT_REQUEST
            )
            r_supi.raise_for_status()
            supi = r_supi.json().get("supi")

            # Lecture du 5QI dans UDR
            r_udr = requests.get(
                f"{UDR}/nudr-dr/v2/subscription-data/{supi}/20893/provisioned-data/sm-data",
                headers={"Authorization": f"Bearer {token_nrf}"},
                timeout=TIMEOUT_REQUEST
            )
            r_udr.raise_for_status()
            sm_data = r_udr.json()
            # On récupère le premier dnnConfiguration → internet → 5gQosProfile → 5qi
            fiveQI = sm_data.get("individualSmSubsData", [{}])[0]\
                .get("dnnConfigurations", {}).get("internet", {})\
                .get("5gQosProfile", {}).get("5qi", DEFAULT_5QI)
            profile["5qi"] = fiveQI

        info = CORRESPONDANCE_5QI.get(fiveQI, {"profil": "QOS_M", "description": "Navigation web"})
        profile.update({"profil": info["profil"], "description": info["description"]})
        return profile

    except Exception as e:
        print(f"[Erreur] Impossible de récupérer le profil QoD pour {numero}: {e}")
        return {"5qi": DEFAULT_5QI, "profil": "QOS_M", "description": "Navigation web (défaut)"}

def creer_session_qos(numero, profil, duree=3600, token=None):
    try:
        r = requests.post(
            CAMARA + "/quality-on-demand/v1/sessions",
            json={"device": {"phoneNumber": numero}, "qosProfile": profil, "duration": duree},
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=TIMEOUT_REQUEST
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[Erreur] Impossible de créer session QoS pour {numero}: {e}")
        return None

def supprimer_session_qos(session_id, token):
    try:
        r = requests.delete(
            CAMARA + f"/quality-on-demand/v1/sessions/{session_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT_REQUEST
        )
        return r.status_code
    except Exception as e:
        print(f"[Erreur] Impossible de supprimer session {session_id}: {e}")
        return None

# Agent IA 

def analyser_avec_llm(numero, statut, profil_reseau):
    prompt = f"""Je suis un agent IA de gestion de réseau télécom 5G.

=== TERMINAL ===
Numéro : {numero}
Statut : {statut.get('reachabilityStatus', 'INCONNU')}
État   : {statut.get('cmState', 'inconnu')}

=== PROFIL RÉSEAU DE L'ABONNÉ ===
5QI         : {profil_reseau['5qi']}
Type service: {profil_reseau['description']}
Profil QoS  : {profil_reseau['profil']}

=== RÈGLES STRICTES ===
1. Si statut = UNREACHABLE → decision = REJETER obligatoirement
2. Si statut = REACHABLE   → decision = ACTIVER avec le profil QoS du 5QI
3. Ne jamais choisir un profil différent de celui indiqué par le 5QI

Réponds UNIQUEMENT avec ce JSON exact, sans texte avant ou après :
{{"decision": "ACTIVER","profilQos": "QOS_E","duree": 3600,"raison": "explication courte"}}"""
    try:
        r = requests.post(
            OLLAMA,
            json={"model": "llama3.2", "prompt": prompt, "stream": False},
            timeout=TIMEOUT_REQUEST
        )
        r.raise_for_status()
        return r.json().get("response", "")
    except Exception as e:
        print(f"[Erreur LLM] {e}")
        return ""

def analyser_reponse_llm(reponse, profil_reseau, statut):
    if statut.get('reachabilityStatus') == 'UNREACHABLE':
        return {"decision": "REJETER", "profilQos": profil_reseau['profil'], "duree": 3600,
                "raison": "Terminal non joignable - rejet automatique"}
    try:
        match = re.search(r'\{.*?\}', reponse, re.DOTALL)
        if match:
            data = json.loads(match.group())
            data['profilQos'] = profil_reseau['profil']
            return data
    except:
        pass
    return {"decision": "ACTIVER", "profilQos": profil_reseau['profil'], "duree": 3600,
            "raison": f"Profil {profil_reseau['profil']} appliqué selon 5QI={profil_reseau['5qi']}"}

def executer_uc1(numero):
    print("=" * 60)
    print("UC1 - Boost de Connectivité Intelligent")
    print(f"Terminal : {numero}")
    print("=" * 60)
    debut = time.time()

    token = obtenir_token_camara()
    if not token:
        print("[Erreur] Aucun token CAMARA disponible, arrêt de l'UC1")
        return

    statut = verifier_statut_terminal(numero, token)
    print(f"[1] Statut terminal : {statut.get('reachabilityStatus')} ({statut.get('source')}) CM={statut.get('cmState')}")

    profil_reseau = obtenir_profile_qod(numero, token)
    print(f"[2] Profil réseau : 5QI={profil_reseau['5qi']} Type={profil_reseau['description']} Profil={profil_reseau['profil']}")

    reponse_llm = analyser_avec_llm(numero, statut, profil_reseau)
    decision = analyser_reponse_llm(reponse_llm, profil_reseau, statut)
    print(f"[3] Décision IA : {decision['decision']} Profil={decision['profilQos']} Raison={decision['raison']}")

    session = None
    if decision["decision"] == "ACTIVER":
        session = creer_session_qos(numero, decision["profilQos"], decision["duree"], token)
        if session:
            print(f"[4] Session QoS activée : {session.get('sessionId')} Status={session.get('status')} Exp={session.get('expiresAt')}")
    else:
        print("[4] QoS REJETÉE - terminal non joignable")

    latence = int((time.time() - debut) * 1000)
    print(f"[5] Latence : {latence}ms (objectif < 500ms)")

    if session and session.get("sessionId"):
        print("[6] Suppression session QoS...")
        supprimer_session_qos(session["sessionId"], token)

    return {
        "numero": numero,
        "5qi": profil_reseau["5qi"],
        "typeService": profil_reseau["description"],
        "statutTerminal": statut.get("reachabilityStatus"),
        "decision": decision["decision"],
        "profilQos": decision["profilQos"],
        "latenceMs": latence,
        "sessionId": session.get("sessionId") if session else None
    }


if __name__ == "__main__":
    terminaux = ["0900000001","0900000002","0900000003","0900000004","0900000005"]
    resultats = []
    for numero in terminaux:
        print("\n")
        r = executer_uc1(numero)
        resultats.append(r)
        time.sleep(1)

    # Résumé final
    print("\n\n" + "="*60)
    print("RÉSUMÉ DE LA SIMULATION")
    print("="*60)
    print(f"{'Numéro':<15} {'5QI':>5} {'Service':<25} {'Profil':>8} {'Décision':>10}")
    print("-"*60)
    for r in resultats:
        print(f"{r['numero']:<15} {r['5qi']:>5} {r['typeService']:<25} {r['profilQos']:>8} {r['decision']:>10}")
