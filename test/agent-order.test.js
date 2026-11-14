import assert from "node:assert/strict";
import { test } from "node:test";
import { stubHerdr } from "./support/herdr.js";
import { AgentOrder, agentAddresses } from "../mod/agent-order.js";

const first = { id: "s1" }, second = { id: "s2" };
const agentList = [
  { address: "other", space: "s3" },
  { address: "second-a", space: "s2" },
  { address: "first-a", space: "s1" },
  { address: "second-b", space: "s2" },
];

test("lists each issue space's agents in list order, leaving out other spaces", () => {
  assert.deepEqual(agentAddresses([second, null, first], agentList), ["second-a", "second-b", "first-a"]);
  assert.deepEqual(agentAddresses([first, second], agentList), ["first-a", "second-a", "second-b"]);
});

test("lists a space's agents once when two issues show it", () => {
  assert.deepEqual(agentAddresses([first, first], agentList), ["first-a"]);
});

test("sends the order only when it changes", (t) => {
  const sent = [];
  stubHerdr(t, { agents: () => agentList, setAgentOrder: (addresses) => { sent.push(addresses); return null; } });
  const order = new AgentOrder();
  order.follow([first, second]);
  order.follow([first, second]);
  order.follow([second, first]);
  assert.deepEqual(sent, [["first-a", "second-a", "second-b"], ["second-a", "second-b", "first-a"]]);
});
