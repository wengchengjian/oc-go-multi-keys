import { describe, it, expect } from "vitest";
import { buildCommands } from "../src/commands.js";

describe("buildCommands", () => {
  it("返回 6 个 tool", () => {
    const commands = buildCommands();
    expect(commands).toHaveProperty("go_keys_add");
    expect(commands).toHaveProperty("go_keys_rm");
    expect(commands).toHaveProperty("go_keys_list");
    expect(commands).toHaveProperty("go_keys_switch");
    expect(commands).toHaveProperty("go_keys_cooldown");
    expect(commands).toHaveProperty("go_keys_reset");
  });

  it("每个 tool 都有 description 和 args", () => {
    const commands = buildCommands();
    for (const [name, t] of Object.entries(commands)) {
      expect(t.description, `${name} 缺少 description`).toBeTruthy();
    }
  });

  it("go_keys_add requires name and key args", () => {
    const commands = buildCommands();
    const addTool = commands["go_keys_add"];
    expect(addTool.args).toHaveProperty("name");
    expect(addTool.args).toHaveProperty("key");
  });
});
