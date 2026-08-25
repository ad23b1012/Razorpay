"""
The agent-commerce contract this merchant publishes.

A word on naming. The agentic-commerce specs in flight right now — NPCI's UAP,
ACP, AP2, x402 — are moving targets, and none of them has a conformance suite a
hackathon project could pass. Claiming compliance with any of them would be a
claim nobody can check and this code cannot honour.

So the wire format below is our own, versioned and documented, and it states
plainly which ideas it borrows from which spec: machine-readable catalogs and
agent checkout from ACP, mandate-bounded spend authority from AP2, an HTTP
payment challenge from x402, and UPI-native settlement from UAP. An external
agent gets a real, stable contract; a reviewer gets an honest description of
what it is.
"""

PROTOCOL_ID = "razoragent.commerce"
PROTOCOL_VERSION = "0.1"
PROTOCOL = f"{PROTOCOL_ID}/{PROTOCOL_VERSION}"

ALIGNED_WITH = [
    {
        "specification": "ACP (Agentic Commerce Protocol)",
        "borrowed": "Machine-readable catalog and agent-initiated checkout.",
        "status": "aligned in shape, not a certified implementation",
    },
    {
        "specification": "AP2 (Agent Payments Protocol)",
        "borrowed": "Spend authority bounded per item and per transaction, with a human gate above a threshold.",
        "status": "aligned in shape, not a certified implementation",
    },
    {
        "specification": "x402",
        "borrowed": "An HTTP challenge that hands a machine caller the payment instructions it needs.",
        "status": "aligned in shape, not a certified implementation",
    },
    {
        "specification": "NPCI UAP",
        "borrowed": "UPI-native settlement as the default rail for Indian buyers.",
        "status": "conceptual alignment only",
    },
]
