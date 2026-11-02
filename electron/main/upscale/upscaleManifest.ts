import type { UpscaleModelId } from "../../../src/features/upscale/types";

export type UpscaleArtifact = {
  modelId: UpscaleModelId;
  fileName: string;
  byteSize: number;
  sha256: string;
  url: string;
};

const realCuganBaseUrl = "https://real-cugan.webgpu.me/models";

export const REAL_CUGAN_ARTIFACTS: readonly UpscaleArtifact[] = [
  artifact("cugan-2x-no-denoise", "up2x-latest-no-denoise-fixed512.onnx", 5_148_509, "bb553bc4e29c59916d0e87a97b4e211095ca7fbea3863b20a4f3b05a4e1721c2"),
  artifact("cugan-2x-conservative", "up2x-latest-conservative-fixed512.onnx", 5_148_509, "68aa158c9322bf5c34ee2070c81818c707de7a7f0345885edf588a5f546eab91"),
  artifact("cugan-2x-denoise1", "up2x-latest-denoise1x-fixed512.onnx", 5_148_509, "d46f5cbe196c339918120805ef359644b1363f67a96ce0c9f710c6f4ebcaa0b7"),
  artifact("cugan-2x-denoise2", "up2x-latest-denoise2x-fixed512.onnx", 5_148_509, "9f8f36e24082e622cf2407075cfd0504c8e89e01ee9a610001075d1c734b00f2"),
  artifact("cugan-2x-denoise3", "up2x-latest-denoise3x-fixed512.onnx", 5_148_509, "db2c6fe241c3002d4c838eaca87ce9f2c7e21129c5dcdfaec8538dc965132ffd"),
  artifact("cugan-3x-no-denoise", "up3x-latest-no-denoise-fixed512.onnx", 5_155_423, "29b7ff8308fa4e51bb0959501019960b5943cd9bd3c13171cc28f1e49ec5dc1b"),
  artifact("cugan-3x-conservative", "up3x-latest-conservative-fixed512.onnx", 5_155_423, "b4f57df0c9add55c44478576be6731dc16bb1b7e1968f3c5639fb6e88d9ba185"),
  artifact("cugan-3x-denoise3", "up3x-latest-denoise3x-fixed512.onnx", 5_155_423, "c6788e2fd17069713f34aa7a07137e2d0e75c3d043245f92da186dbbdad78a6b"),
  artifact("cugan-4x-no-denoise", "up4x-latest-no-denoise-fixed512.onnx", 5_637_971, "13696addef2b397e0aca4a43cd1bca2212232c95eaadfc52a9949335d2f3b2fe"),
  artifact("cugan-4x-conservative", "up4x-latest-conservative-fixed512.onnx", 5_637_971, "bb58b399acbfaf8228e6f084bf1f82376882a3865dcd2f0ac71fa92dbbf183ee"),
  artifact("cugan-4x-denoise3", "up4x-latest-denoise3x-fixed512.onnx", 5_637_971, "0db3b74d3501a6a9dbca5b865215369c90906ec30cd0061def91da7ca766206c"),
];

export const REAL_ESRGAN_ARTIFACT = {
  version: "0.2.5.0",
  fileName: "realesrgan-ncnn-vulkan-20220424-windows.zip",
  byteSize: 45_474_481,
  sha256: "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d",
  url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip",
} as const;

export const REAL_ESRGAN_REQUIRED_FILES = [
  "realesrgan-ncnn-vulkan.exe",
  "vcomp140.dll",
  "models/realesrgan-x4plus.bin",
  "models/realesrgan-x4plus.param",
  "models/realesrgan-x4plus-anime.bin",
  "models/realesrgan-x4plus-anime.param",
  "models/realesr-animevideov3-x2.bin",
  "models/realesr-animevideov3-x2.param",
  "models/realesr-animevideov3-x3.bin",
  "models/realesr-animevideov3-x3.param",
  "models/realesr-animevideov3-x4.bin",
  "models/realesr-animevideov3-x4.param",
] as const;

function artifact(
  modelId: UpscaleModelId,
  fileName: string,
  byteSize: number,
  sha256: string,
): UpscaleArtifact {
  return {
    modelId,
    fileName,
    byteSize,
    sha256,
    url: `${realCuganBaseUrl}/${fileName}`,
  };
}
