// Makes agent.next and agent.prev follow the list: the agents in each drawn issue's worktree space, issue by
// issue, each space's agents in Herdr's order. Agents in other spaces are left out, so Herdr appends them after.
import { agents, setAgentOrder } from "herdr";

// The addresses of the agents in `issueSpaces`, the drawn issues' worktree spaces in list order (null for an
// issue without one).
export function agentAddresses(issueSpaces, agentList) {
  const spaceIds = [...new Set(issueSpaces.filter(Boolean).map((space) => space.id))];
  return spaceIds.flatMap((spaceId) => agentList.filter((agent) => agent.space === spaceId).map((agent) => agent.address));
}

export class AgentOrder {
  sent = null;

  // Sends the order for `issueSpaces` unless it is the one sent last.
  follow(issueSpaces) {
    const addresses = agentAddresses(issueSpaces, agents());
    const key = JSON.stringify(addresses);
    if (key === this.sent) return;
    this.sent = key;
    setAgentOrder(addresses);
  }
}
