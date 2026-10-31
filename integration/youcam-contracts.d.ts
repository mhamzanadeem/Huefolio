/**
 * Documentation-derived wire types, researched 2026-10-30; NOT a live integration.
 * Sources and unresolved specification differences: docs/YOUCAM-INTEGRATION-PLAN.md.
 * Response properties are optional because the published schemas do not mark them required.
 * Before use, validate untrusted JSON at runtime; these declarations do not validate it.
 */
export type FaceAngleStrictness = 'strict' | 'high' | 'medium' | 'low' | 'flexible';
export type TaskStatus = 'running' | 'success' | 'error';
/** anyOf in vendor spec; Huefolio will send src_file_id only. */
export type SourceFile = { src_file_id: string } | { src_file_url: string };
export type RunColorTaskRequest = SourceFile & { face_angle_strictness_level?: FaceAngleStrictness };
export interface RunTaskResponse { status?: number; data?: { task_id?: string } }
export interface FaceQuality {
  has_face?: boolean;
  area?: string;
  frontal?: string;
  lighting?: string;
  faceangle?: string;
}
export type EyeColorName = 'Amber' | 'Brown' | 'Green' | 'Blue' | 'Gray' | 'Other';
export type HairColorName = 'Auburn' | 'Black' | 'Blonde' | 'Brown' | 'Grey/White' | 'Red';
/** Literal enum from vendor OpenAPI, not an assumption that hair color is continuous. */
export type HairColorHex = '#a0a0a0' | '#722626' | '#000000' | '#FAF0BE' | '#42280E' | '#808080' | '#B56637';
export interface FacialColors {
  eye_color?: string;
  eye_color_name?: EyeColorName;
  lip_color?: string;
  eyebrow_color?: string;
  /** Vendor pattern: ^#([A-Fa-f0-9]{6})$ */
  skin_color?: string;
  hair_color?: HairColorHex;
  hair_color_name?: HairColorName;
}
export interface ColorResults { face_quality?: FaceQuality; color?: FacialColors }
/** Narrow enum in OpenAPI; prose error tables additionally name pose/size codes. */
export type DocumentedEngineError =
  | 'error_exceed_max_image_size' | 'exceed_max_filesize' | 'invalid_parameter'
  | 'error_download_image' | 'error_download_mask' | 'error_decode_image' | 'error_decode_mask'
  | 'error_nsfw_content_detected' | 'error_no_face' | 'error_pose' | 'error_face_parsing'
  | 'error_inference' | 'exceed_nsfw_retry_limits' | 'error_upload' | 'unknown_internal_error';
export interface TaskStatusResponse<Results = ColorResults> {
  status?: number;
  data?: {
    task_status?: TaskStatus;
    error?: DocumentedEngineError | null;
    error_message?: string;
    results?: Results;
  };
}
export interface ProviderHttpError { status?: number; error?: string; error_code?: string }
export interface CreateFileRequest {
  files: Array<{ content_type: string; file_name: string; file_size: number }>;
}
export interface UploadInstruction {
  /** Object unconstrained by the vendor schema; narrow and sanitize at runtime. */
  headers?: Record<string, unknown>;
  url?: string;
  method?: string;
}
export interface CreatedFile {
  content_type?: string;
  file_name?: string;
  file_id?: string;
  requests?: UploadInstruction[];
}
/**
 * The documented example has top-level files. FileResponseV2 also declares
 * status and an invalid `data: null` schema next to a $ref. Do not guess data.files.
 */
export interface CreateFileResponse { files?: CreatedFile[]; status?: number; data?: unknown }
export interface DeleteTaskRequest { task_id: string }
export interface DeleteTaskResponse { status?: number }
export type DeleteTaskErrorCode = 'OperationNotSupport' | 'OperationInvalid' | 'InvalidTaskId' | 'InvalidParameters';

// OPTIONAL ENDPOINT AUDIT ONLY. Not selected for the first Huefolio integration.
export type FaceFeature =
  | 'eyeShape' | 'eyeSize' | 'eyeAngle' | 'eyeDistance' | 'eyelid'
  | 'eyebrowShape' | 'eyebrowThickness' | 'eyebrowDistance' | 'eyebrowShortness'
  | 'cheekbones' | 'faceShape' | 'lipShape' | 'noseWidth' | 'noseLength' | 'age' | 'gender'
  | 'eyeColor' | 'lipColor' | 'eyebrowColor' | 'hairColor'
  | 'horizontalThird' | 'verticalFifth' | 'faceAspectRatio' | 'eyeAspectRatio'
  | 'eyebrowPosition' | 'eyebrowArch' | 'eyeHeightToEyebrowDistance'
  | 'noseAspectRatio' | 'noseWidthToMouthWidth' | 'noseToLipToChin' | 'upperLipToLowerLip';
export type RunFaceTaskRequest = SourceFile & { features: FaceFeature[]; face_angle_strictness_level?: FaceAngleStrictness };
type EyelidType = 'Hooded-lid' | 'Single-lid' | 'Double-lid' | 'Deep-Set';
type EyeAngle = 'Downturned' | 'Upturned' | 'Average';
type EyeShape = 'Narrow' | 'Round' | 'Almond';
type BrowShape = 'Hard Angled' | 'Soft Angled' | 'Straight' | 'Rounded' | 'Obscured';
type BrowThickness = 'Dense' | 'Sparse' | 'Average' | 'Unknown';
type Cheekbone = 'Flat Cheekbone' | 'High Cheekbone' | 'Low Cheekbone' | 'Round Cheeks';
export interface FacialRatio {
  horizontal_third?: number[];
  vertical_fifth?: number[];
  face_aspect_ratio?: number[];
  left_eye_aspect_ratio?: number[];
  right_eye_aspect_ratio?: number[];
  left_eyebrow_arch_to_eyebrow_width?: number[];
  right_eyebrow_arch_to_eyebrow_width?: number[];
  left_eye_height_to_eyebrow_distance?: number[];
  right_eye_height_to_eyebrow_distance?: number[];
  overall_eye_height_to_eyebrow_distance?: number[];
  nose_aspect_ratio?: number[];
  nose_width_to_mouth_width?: number[];
  nose_to_lip_to_chin?: number[];
  upper_lip_to_lower_lip?: number[];
}
export interface FaceResults {
  face_quality?: FaceQuality;
  facialratio?: FacialRatio;
  cheekbone?: { left?: Cheekbone; right?: Cheekbone; overall?: Cheekbone };
  eyelid?: {
    left_eyelid?: EyelidType; right_eyelid?: EyelidType;
    left_angle?: EyeAngle; right_angle?: EyeAngle;
    left_shape?: EyeShape; right_shape?: EyeShape;
    setting?: 'Close-set' | 'Wide-Set' | 'Average';
    size?: 'Big' | 'Small' | 'Average';
  };
  eyebrow?: {
    gap?: 'Far-Apart' | 'Close' | 'Average';
    left_shape?: BrowShape; right_shape?: BrowShape;
    left_body_thickness?: BrowThickness; right_body_thickness?: BrowThickness;
    left_tail_thickness?: BrowThickness; right_tail_thickness?: BrowThickness;
    left_thinness?: 'Thin' | 'Normal'; right_thinness?: 'Thin' | 'Normal';
    left_shortness?: 'Short' | 'Normal'; right_shortness?: 'Short' | 'Normal';
  };
  faceshape?: 'Triangle' | 'Diamond' | 'Heart' | 'InvTriangle' | 'Oblong' | 'Oval' | 'Round' | 'Square' | 'Unknown';
  lipshape?: Array<'Bow' | 'Downturned' | 'Full' | 'Heavy Lower Lip' | 'Heavy Upper Lip' | 'Narrow' | 'Round' | 'Thin' | 'Wide' | 'Average'>;
  nose?: { width?: 'Narrow' | 'Broad' | 'Average'; length?: 'Long' | 'Short' | 'Average' };
  /** Face endpoint documents four colors, not skin_color. */
  color?: Omit<FacialColors, 'skin_color'>;
  agegender?: { age?: number; gender?: 'female' | 'male' | 'unknown' };
}
export type FaceTaskStatusResponse = TaskStatusResponse<FaceResults>;
