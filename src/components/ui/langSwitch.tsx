import { useTranslation } from "react-i18next";

export function LangSwitch() {
  const { i18n } = useTranslation();

  return (
    <div className="flex gap-2 absolute top-4 right-4">
      <button onClick={() => i18n.changeLanguage("mn")}>MN</button>
      <button onClick={() => i18n.changeLanguage("en")}>EN</button>
    </div>
  );
}
