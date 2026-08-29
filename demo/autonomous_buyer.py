#!/usr/bin/env python3
"""
An external AI buyer that shops this merchant end to end, with no human involved.

Run it against a live backend:

    python demo/autonomous_buyer.py
    python demo/autonomous_buyer.py --budget 9000 --haggle

Nothing here imports the server. It is an ordinary HTTP client that starts from
one well-known URL and discovers everything else, which is the point: if this
script can buy something, so can somebody else's agent.

The agent carries a spend mandate and refuses to exceed it. That is the half of
agentic commerce the merchant cannot enforce — the merchant bounds what it will
offer, the buyer bounds what it will pay, and the audit chain records both.
"""

import argparse
import json
import sys
import textwrap
from typing import Any, Dict, List, Optional

try:
    import httpx
except ImportError:
    sys.exit("This demo needs httpx:  pip install httpx")


DEFAULT_BASE_URL = "http://localhost:8000"

# ANSI styling, dropped automatically when piped to a file.
_TTY = sys.stdout.isatty()
def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _TTY else text

BOLD = lambda t: _c("1", t)
DIM = lambda t: _c("2", t)
GREEN = lambda t: _c("32", t)
YELLOW = lambda t: _c("33", t)
BLUE = lambda t: _c("36", t)
RED = lambda t: _c("31", t)


class AgentAbort(Exception):
    """The agent decided not to proceed. Not an error — a bounded refusal."""


def step(n: int, title: str) -> None:
    print()
    print(BOLD(f"  [{n}] {title}"))
    print(DIM("  " + "─" * 66))


def line(label: str, value: Any = "") -> None:
    print(f"      {label:<34} {value}")


def wrapped(text: str, indent: str = "      ") -> None:
    for chunk in textwrap.wrap(text, width=90):
        print(f"{indent}{DIM(chunk)}")


class AutonomousBuyer:
    """A buying agent with a budget and no human to ask."""

    def __init__(self, base_url: str, budget_inr: float, agent_id: str, haggle: bool):
        self.base = base_url.rstrip("/")
        self.budget = budget_inr
        self.agent_id = agent_id
        self.haggle = haggle
        self.http = httpx.Client(timeout=30.0)
        self.discovery: Dict[str, Any] = {}

    # -- 1. Discovery -------------------------------------------------------

    def discover(self) -> None:
        step(1, "Discover the merchant")
        url = f"{self.base}/.well-known/agent-commerce.json"
        line("GET", url)

        response = self.http.get(url)
        response.raise_for_status()
        self.discovery = response.json()

        authority = self.discovery["spend_authority"]
        line("protocol", BLUE(self.discovery["protocol"]))
        line("merchant", self.discovery["merchant"]["name"])
        line("catalog", self.discovery["catalog"]["url"])
        line("purchase flow", self.discovery["purchase"]["flow"])
        line("agent may discount up to", f"{authority['max_discount_percent']}%")
        line("human approval required above", f"₹{authority['human_approval_threshold_inr']:,.0f}")
        print()
        wrapped(
            "The merchant publishes its own spend limits before I ask for anything, so I know "
            "up front what it can agree to without a human."
        )

    # -- 2. Read the catalog ------------------------------------------------

    def read_catalog(self) -> List[Dict[str, Any]]:
        step(2, "Read the machine-readable catalog")
        url = f"{self.base}{self.discovery['catalog']['url']}"
        line("GET", url)

        catalog = self.http.get(url).json()
        items = catalog["items"]
        line("items returned", len(items))
        print()
        for item in items[:6]:
            affordable = item["base_price_inr"] <= self.budget
            marker = GREEN("within budget") if affordable else RED("over budget")
            print(
                f"      {item['item_id']:<28} ₹{item['base_price_inr']:>9,.0f}  "
                f"stock {item['available_stock']:<4} neg≤{item['negotiable_discount_limit_pct']:>4.0f}%  {marker}"
            )
        return items

    # -- 3. Choose, within the mandate --------------------------------------

    def choose(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        step(3, "Choose something I can actually afford")
        line("my spend mandate", f"₹{self.budget:,.2f}")

        affordable = [
            i for i in items
            if i["base_price_inr"] <= self.budget and i["available_stock"] > 0
        ]
        if not affordable:
            raise AgentAbort(
                f"Nothing in the catalog is both in stock and under my ₹{self.budget:,.2f} mandate."
            )

        # Buy the most capable thing the mandate allows.
        pick = max(affordable, key=lambda i: i["base_price_inr"])
        line("selected", BOLD(pick["title"]))
        line("list price", f"₹{pick['base_price_inr']:,.2f}")
        line("headroom left", f"₹{self.budget - pick['base_price_inr']:,.2f}")
        return pick

    # -- 4. Negotiate (optional) --------------------------------------------

    def negotiate(self, pick: Dict[str, Any]) -> float:
        step(4, "Negotiate")
        lowball = round(pick["base_price_inr"] * 0.55, 2)
        line("POST", f"{self.base}/agent/v1/negotiate")
        line("my opening offer", f"₹{lowball:,.2f}  " + DIM("(45% under list — deliberately cheeky)"))

        deal = self.http.post(
            f"{self.base}/agent/v1/negotiate",
            json={
                "item_ids": [pick["item_id"]],
                "target_budget_inr": lowball,
                "buyer_agent_id": self.agent_id,
            },
        ).json()

        print()
        line("merchant decision", YELLOW(deal["decision"]))
        line("counter-offer", f"₹{deal['offered_price_inr']:,.2f}")
        line("discount granted", f"{deal['discount_percent']}%")
        print()
        wrapped(f"Merchant's reasoning: {deal['rationale']}")

        granted = deal["discount_amount_inr"]
        if deal.get("requires_approval"):
            print()
            wrapped(
                "It refused to hand over the bigger discount on its own authority and filed the "
                "request with a human instead. I will take the bounded counter-offer rather than wait."
            )
        return granted

    # -- 5. Purchase: the payment challenge ---------------------------------

    def purchase(self, pick: Dict[str, Any], discount_inr: float) -> Dict[str, Any]:
        step(5, "Ask to buy — expect a payment challenge")
        url = f"{self.base}/agent/v1/purchase"
        idem = f"idem_{self.agent_id}_{pick['item_id']}"

        body = {
            "items": [{"product_id": pick["item_id"], "quantity": 1}],
            "buyer_agent_id": self.agent_id,
            "max_spend_inr": self.budget,
            "requested_discount_inr": discount_inr,
            "reason": "Autonomous purchase within declared mandate",
            "idempotency_key": idem,
        }
        line("POST", url)
        line("Idempotency-Key", idem)

        response = self.http.post(url, json=body)
        line("response", f"{BOLD(str(response.status_code))} {response.reason_phrase}")

        if response.status_code == 202:
            gate = response.json()
            print()
            wrapped(
                "The merchant held my request for a human. Nothing was reserved and nothing is "
                "owed. A well-behaved agent stops here rather than retrying."
            )
            raise AgentAbort(gate["explanation"])

        if response.status_code != 402:
            raise AgentAbort(f"Unexpected response {response.status_code}: {response.text[:300]}")

        challenge = response.json()
        terms = challenge["accepts"][0]
        mandate = challenge["buyer_mandate"]

        print()
        line("amount due", BOLD(f"₹{terms['amount_inr']:,.2f}"))
        line("razorpay order", terms["razorpay_order_id"])
        line("settlement network", terms["network"])
        line("signature algorithm", terms["signature_algorithm"])
        line("within my mandate?", GREEN("yes") if mandate["within_mandate"] else RED("no"))
        print()
        wrapped(
            "A 402 is the whole trick: I never needed a browser or a checkout page. The merchant "
            "told me exactly what to pay and how to prove I paid it."
        )

        print()
        line("bounds the merchant applied", "")
        for bound in challenge["guardrail"]["bounds_evaluated"]:
            print(
                f"        · {bound['name']:<24} cap ₹{bound['cap_inr']:>10,.2f} "
                f"({bound['cap_percent']:>5.1f}%)  {DIM(bound['kind'])}"
            )

        # The buyer enforces its own limit. The merchant's word is not enough.
        if not mandate["within_mandate"]:
            raise AgentAbort(
                f"₹{terms['amount_inr']:,.2f} exceeds my ₹{self.budget:,.2f} mandate. Declining."
            )

        return challenge

    # -- 6. Settle ----------------------------------------------------------

    def settle(self, challenge: Dict[str, Any]) -> Dict[str, str]:
        step(6, "Settle the payment")
        terms = challenge["accepts"][0]
        settle_url = terms.get("test_settlement_endpoint")

        if not settle_url:
            raise AgentAbort(
                "The merchant is running on live Razorpay credentials, so payment must be made "
                "through Razorpay itself. This demo can only settle against the test rail."
            )

        line("POST", f"{self.base}{settle_url}")
        proof = self.http.post(
            f"{self.base}{settle_url}",
            json={"razorpay_order_id": terms["razorpay_order_id"]},
        ).json()

        # Carry the order id forward; the challenge is what identifies the order.
        proof.setdefault("razorpay_order_id", terms["razorpay_order_id"])

        line("payment id", proof["razorpay_payment_id"])
        line("signature", proof["razorpay_signature"][:44] + "…")
        print()
        wrapped(
            "This signature is a real HMAC-SHA256 over the order and payment ids. The merchant "
            "recomputes it before fulfilling anything — a forged one is rejected."
        )
        return proof

    # -- 7. Redeem ----------------------------------------------------------

    def redeem(self, pick: Dict[str, Any], discount_inr: float, proof: Dict[str, str]) -> Dict[str, Any]:
        step(7, "Repeat the request, this time with proof of payment")
        body = {
            "items": [{"product_id": pick["item_id"], "quantity": 1}],
            "buyer_agent_id": self.agent_id,
            "max_spend_inr": self.budget,
            "requested_discount_inr": discount_inr,
            "idempotency_key": f"idem_{self.agent_id}_{pick['item_id']}",
            "payment": {
                "razorpay_order_id": proof["razorpay_order_id"],
                "razorpay_payment_id": proof["razorpay_payment_id"],
                "razorpay_signature": proof["razorpay_signature"],
            },
        }
        response = self.http.post(f"{self.base}/agent/v1/purchase", json=body)
        line("response", f"{BOLD(str(response.status_code))} {response.reason_phrase}")

        if response.status_code != 200:
            raise AgentAbort(f"Fulfilment refused: {response.text[:300]}")

        receipt = response.json()
        print()
        line("status", GREEN(receipt["status"].upper()))
        line("order id", receipt["order_id"])
        line("amount paid", BOLD(f"₹{receipt['amount_paid_inr']:,.2f}"))
        line("discount applied", f"₹{receipt['discount_applied_inr']:,.2f}")
        for item in receipt["items"]:
            line("fulfilled", f"{item['quantity']} × {item['name']}")
        line("audit trace", receipt["audit_trace_id"])
        print()
        wrapped(f"Merchant's verification note: {receipt['signature_verification']}")
        return receipt

    # -- 8. Verify the merchant's own books ---------------------------------

    def audit(self) -> None:
        step(8, "Verify the merchant did not rewrite history")
        url = f"{self.base}/api/v1/audit/verify"
        line("GET", url)

        report = self.http.get(url).json()
        line("chain valid", GREEN("yes") if report["valid"] else RED("NO"))
        line("records checked", report["records_checked"])
        if report.get("head_hash"):
            line("head hash", report["head_hash"][:48] + "…")
        print()
        wrapped(
            "I can check this myself, as any counterparty should be able to. Every money decision "
            "the merchant made about me is in a hash chain, and tampering with any of it breaks "
            "the link."
        )

    # -- Orchestration ------------------------------------------------------

    def run(self) -> int:
        print()
        print(BOLD("  ╭─────────────────────────────────────────────────────────────────────╮"))
        print(BOLD("  │  Autonomous AI Buyer — no human in this loop                        │"))
        print(BOLD("  ╰─────────────────────────────────────────────────────────────────────╯"))
        line("agent id", self.agent_id)
        line("spend mandate", f"₹{self.budget:,.2f}")
        line("merchant", self.base)

        try:
            self.discover()
            items = self.read_catalog()
            pick = self.choose(items)
            discount = self.negotiate(pick) if self.haggle else 0.0
            challenge = self.purchase(pick, discount)
            proof = self.settle(challenge)
            self.redeem(pick, discount, proof)
            self.audit()
        except AgentAbort as e:
            print()
            print(YELLOW(f"  ■ Agent stopped on purpose: {e}"))
            print()
            return 0
        except httpx.HTTPError as e:
            print()
            print(RED(f"  ✕ Could not reach the merchant: {e}"))
            print(DIM(f"    Is the backend running at {self.base}?"))
            print()
            return 1

        print()
        print(GREEN(BOLD("  ✓ Purchase completed autonomously, bounded at every step.")))
        print()
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="An external AI buyer that transacts with the RazorAgent merchant."
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Merchant API root.")
    parser.add_argument("--budget", type=float, default=16000.0, help="The agent's spend mandate, INR.")
    parser.add_argument("--agent-id", default="acme_shopping_agent", help="Identifies this buyer.")
    parser.add_argument("--haggle", action="store_true", help="Try to negotiate before buying.")
    args = parser.parse_args()

    return AutonomousBuyer(args.base_url, args.budget, args.agent_id, args.haggle).run()


if __name__ == "__main__":
    raise SystemExit(main())
