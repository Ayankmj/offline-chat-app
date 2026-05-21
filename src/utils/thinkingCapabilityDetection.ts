const THINKING_ARCHITECTURES = [
  'deepseek',
  'qwen3',
  'glm',
  'minicpm',
  'granite',
];

const THINKING_KEYWORDS = [
  'thinking',
  'reasoning',
  'deepseek',
  'thinker',
  'r1',
  'reason',
  'cot',
  'chain of thought',
];

const THINKING_CHAT_TEMPLATES = [
  '<｜begin▁of▁thinking｜>',
  '<think>',
  '<|thinking|>',
  '<think>',
  '<|im_start|>thinking',
];

export function detectThinkingCapability(
  architecture: string = '',
  modelName: string = '',
  chatTemplate: string = '',
): boolean {
  const lowerArch = architecture.toLowerCase();
  const lowerName = modelName.toLowerCase();
  const lowerTemplate = chatTemplate.toLowerCase();

  if (THINKING_ARCHITECTURES.some(a => lowerArch.includes(a))) return true;
  if (THINKING_KEYWORDS.some(k => lowerName.includes(k))) return true;
  if (THINKING_CHAT_TEMPLATES.some(t => lowerTemplate.includes(t))) return true;

  return false;
}
