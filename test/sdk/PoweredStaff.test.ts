import { AttackStyle, AttackStylesController } from "../../src/sdk/AttackStylesController";
import { EyeOfAyak } from "../../src/content/weapons/EyeOfAyak";
import type { Unit } from "../../src/sdk/Unit";

describe("powered staves", () => {
  beforeEach(() => {
    AttackStylesController.controller = new AttackStylesController();
  });

  test("Eye of Ayak scales its built-in spell from the current Magic level", () => {
    const weapon = new EyeOfAyak();
    const caster = { currentStats: { magic: 99 } } as Unit;

    expect(weapon._baseSpellDamage(caster)).toBe(27);
    caster.currentStats.magic = 112;
    expect(weapon._baseSpellDamage(caster)).toBe(31);
  });

  test("uses accurate at six tiles and longrange at eight tiles", () => {
    const weapon = new EyeOfAyak();

    expect(weapon.attackStyle()).toBe(AttackStyle.ACCURATE);
    expect(weapon.attackRange).toBe(6);

    AttackStylesController.controller.setWeaponAttackStyle(weapon, AttackStyle.LONGRANGE);
    expect(weapon.attackRange).toBe(8);
  });

  test("has its documented normal attack speed and weight", () => {
    const weapon = new EyeOfAyak();

    expect(weapon.attackSpeed).toBe(3);
    expect(weapon.weight).toBe(2);
    expect(weapon.hasSpecialAttack()).toBe(false);
  });
});
