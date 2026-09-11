type AiSettingsHeaderProps = {
  title: string;
};

export function AiSettingsHeader({ title }: AiSettingsHeaderProps) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold" id="ai-settings-title">
        {title}
      </h2>
    </div>
  );
}