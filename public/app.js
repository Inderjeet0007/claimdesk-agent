const thread = document.getElementById("thread");
const composer = document.getElementById("composer");
const input = document.getElementById("composer-input");
const caseQueue = document.getElementById("case-queue");

let sessionId = null;
let caseQueueHasEntries = false;

function addMessage(role, body) {
  const wrap = document.createElement("div");
  wrap.className = `msg msg-${role}`;
  const roleLabel = document.createElement("div");
  roleLabel.className = "msg-role";
  roleLabel.textContent = role === "user" ? "You" : "ClaimDesk";
  const bodyEl = document.createElement("div");
  bodyEl.className = "msg-body";
  bodyEl.textContent = body;
  wrap.appendChild(roleLabel);
  wrap.appendChild(bodyEl);
  thread.appendChild(wrap);
  thread.scrollTop = thread.scrollHeight;
  return wrap;
}

function addDecisionChip(container, { claim_id, decision, payout_amount }) {
  const chip = document.createElement("div");
  chip.className = "decision-chip";
  const statusClass = `status-${decision}`;
  chip.innerHTML = `
    <span class="claim-id">${claim_id}</span>
    <span class="status-chip ${statusClass}">${decision.replace(/_/g, " ")}</span>
    ${payout_amount ? `<span class="amount">$${payout_amount} payout</span>` : ""}
  `;
  container.appendChild(chip);
}

function upsertQueueRow({ claim_id, decision }) {
  if (!claim_id) return;
  if (!decision) decision = "pending";
  if (caseQueue.querySelector(".case-empty")) {
    caseQueue.innerHTML = "";
    caseQueueHasEntries = true;
  }
  let row = caseQueue.querySelector(`[data-claim="${claim_id}"]`);
  if (!row) {
    row = document.createElement("li");
    row.className = "case-row";
    row.dataset.claim = claim_id;
    caseQueue.prepend(row);
  }
  const statusClass = `status-${decision}`;
  row.innerHTML = `<span class="case-id">${claim_id}</span><span class="status-chip ${statusClass}">${decision.replace(/_/g, " ")}</span>`;
}

async function sendMessage(message) {
  addMessage("user", message);
  const typing = addMessage("agent", "");
  typing.classList.add("typing");
  typing.querySelector(".msg-body").textContent = "ClaimDesk is reviewing your claim…";

  try {
    const res = await fetch("/v1/claims", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId }),
    });
    const data = await res.json();
    sessionId = data.conversation || sessionId;

    typing.classList.remove("typing");
    typing.querySelector(".msg-body").textContent = data.agent_reply || "(no reply)";

    if (data.claim_id && data.decision) {
      addDecisionChip(typing, data);
      upsertQueueRow(data);
    }
  } catch (err) {
    typing.classList.remove("typing");
    typing.querySelector(".msg-body").textContent = `Something went wrong talking to ClaimDesk: ${err.message}`;
  }
  thread.scrollTop = thread.scrollHeight;
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  input.style.height = "auto";
  sendMessage(message);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

document.querySelectorAll(".hint").forEach((btn) => {
  btn.addEventListener("click", () => {
    input.value = btn.dataset.fill;
    input.focus();
    input.dispatchEvent(new Event("input"));
  });
});
