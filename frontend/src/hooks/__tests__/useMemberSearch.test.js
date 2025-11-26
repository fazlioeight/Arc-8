import {
  buildMemberOption,
  formatMemberLabel,
  pickMemberIdForNavigation,
} from "../useMemberSearch";

describe("useMemberSearch helpers", () => {
  const sampleMember = {
    id: "123",
    member_key: "M-123",
    first_name: "Alex",
    last_name: "Doe",
    dob: "1990-01-01",
  };

  it("formats member labels consistently", () => {
    expect(formatMemberLabel(sampleMember)).toBe(
      "M-123 | Alex Doe | DOB 1990-01-01"
    );
  });

  it("normalizes member options with navigation id and raw member", () => {
    const option = buildMemberOption(sampleMember);
    expect(option).toMatchObject({
      key: "123",
      value: "M-123",
      label: "M-123 | Alex Doe | DOB 1990-01-01",
      memberId: "123",
      member: sampleMember,
    });
  });

  it("picks member id from multiple candidate fields", () => {
    expect(pickMemberIdForNavigation({ memberId: "abc-1" })).toBe("abc-1");
    expect(pickMemberIdForNavigation({ member_id: "xyz-2" })).toBe("xyz-2");
    expect(pickMemberIdForNavigation({ id: "raw-id" })).toBe("raw-id");
  });
});
