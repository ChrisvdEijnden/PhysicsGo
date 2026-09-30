import "../styles/global.css";
import "./settings.css";

import TopBar from "../components/TopBar";
import { PRIVACY, PRIVACY_UPDATED } from "../data/privacy";
import { useTranslation } from "../lib/useTranslations";

// What PhysicsGo stores and why; open to everyone, linked from registration and Settings
export default function Privacy() {
    const { t, language } = useTranslation();
    const text = PRIVACY[language];
    return (
        <div className="page-settings">
            <TopBar crumbs={[{ label: t("nav.privacy") }]}/>
            <div className="content-settings">
                <article className="privacy">
                    <h1>{text.title}</h1>
                    <p className="privacy-updated">
                        {t("privacy.updated", { date: new Date(PRIVACY_UPDATED).toLocaleDateString(language, { dateStyle: "long" }) })}
                    </p>
                    <p>{text.intro}</p>
                    {text.sections.map((section) => (
                        <section key={section.title}>
                            <h2>{section.title}</h2>
                            {section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
                            {section.paragraphs?.map((p) => <p key={p}>{p}</p>)}
                        </section>
                    ))}
                </article>
            </div>
        </div>
    );
}
