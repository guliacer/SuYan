import { describe, expect, it } from "vitest";
import {
  buildHardwareEncoderPlan,
  buildHardwareQualityArgs,
  buildSoftwareEncoderPlan,
  buildSoftwareQualityArgs,
} from "../../electron/main/runtime/ffmpegEncoders";

describe("buildHardwareQualityArgs", () => {
  it("maps crf to nvenc vbr/cq args", () => {
    const args = buildHardwareQualityArgs("nvenc", 23);

    expect(args).toContain("-rc");
    expect(args[args.indexOf("-rc") + 1]).toBe("vbr");
    expect(args).toContain("-cq");
    expect(args[args.indexOf("-cq") + 1]).toBe("23");
  });

  it("maps crf to qsv global_quality", () => {
    const args = buildHardwareQualityArgs("qsv", 20);

    expect(args).toContain("-global_quality");
    expect(args[args.indexOf("-global_quality") + 1]).toBe("20");
  });

  it("maps crf to amf cqp qp_i/qp_p", () => {
    const args = buildHardwareQualityArgs("amf", 28);

    expect(args).toContain("-rc");
    expect(args[args.indexOf("-rc") + 1]).toBe("cqp");
    expect(args[args.indexOf("-qp_i") + 1]).toBe("28");
    expect(args[args.indexOf("-qp_p") + 1]).toBe("28");
  });

  it("clamps out-of-range and non-finite crf values", () => {
    expect(buildHardwareQualityArgs("nvenc", -5)[buildHardwareQualityArgs("nvenc", -5).indexOf("-cq") + 1]).toBe("0");
    expect(buildHardwareQualityArgs("nvenc", 99)[buildHardwareQualityArgs("nvenc", 99).indexOf("-cq") + 1]).toBe("51");

    const nanArgs = buildHardwareQualityArgs("nvenc", Number.NaN);
    expect(nanArgs[nanArgs.indexOf("-cq") + 1]).toBe("23");
  });

  it("rounds fractional crf values", () => {
    const args = buildHardwareQualityArgs("qsv", 22.6);
    expect(args[args.indexOf("-global_quality") + 1]).toBe("23");
  });
});

describe("buildSoftwareQualityArgs", () => {
  it("uses libx264 for h264", () => {
    const args = buildSoftwareQualityArgs("h264", 23);

    expect(args).toContain("-c:v");
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args[args.indexOf("-crf") + 1]).toBe("23");
    expect(args[args.indexOf("-preset") + 1]).toBe("medium");
  });

  it("uses libx265 for h265", () => {
    const args = buildSoftwareQualityArgs("h265", 26);

    expect(args[args.indexOf("-c:v") + 1]).toBe("libx265");
    expect(args[args.indexOf("-crf") + 1]).toBe("26");
  });
});

describe("buildSoftwareEncoderPlan", () => {
  it("produces a non-hardware plan with the software encoder args", () => {
    const plan = buildSoftwareEncoderPlan("h264", 23);

    expect(plan.hardware).toBe(false);
    expect(plan.vendor).toBeNull();
    expect(plan.encoder).toBe("libx264");
    expect(plan.videoArgs[plan.videoArgs.indexOf("-c:v") + 1]).toBe("libx264");
  });
});

describe("buildHardwareEncoderPlan", () => {
  it("produces a hardware plan whose args start with the encoder", () => {
    const plan = buildHardwareEncoderPlan("h264_nvenc", "nvenc", 23);

    expect(plan.hardware).toBe(true);
    expect(plan.vendor).toBe("nvenc");
    expect(plan.encoder).toBe("h264_nvenc");
    expect(plan.videoArgs[0]).toBe("-c:v");
    expect(plan.videoArgs[1]).toBe("h264_nvenc");
    expect(plan.videoArgs).toContain("-cq");
  });
});
