import type { Language } from "../lib/useLanguage";

// The privacy statement shown at #/privacy and linked from registration and Settings. Keep it in
// step with what the server stores (server/db.js) and with docs/privacy.md for schools.
export const PRIVACY_UPDATED = "2026-09-30";

export interface PrivacySection {
    title: string;
    paragraphs?: string[];
    items?: string[];
}

export const PRIVACY: Record<Language, { title: string; intro: string; sections: PrivacySection[] }> = {
    en: {
        title: "Privacy statement",
        intro: "PhysicsGo is used by your school for physics modelling lessons. This page explains what PhysicsGo stores about you, why, who can see it, how long it's kept, and what you can do about it.",
        sections: [
            {
                title: "Who is responsible",
                paragraphs: [
                    "Your school decides to use PhysicsGo and is responsible for your data (the controller). Whoever runs PhysicsGo for your school processes the data only on the school's behalf (the processor), under a data processing agreement with the school.",
                    "Questions about your data go to your teacher or your school's data protection officer.",
                ],
            },
            {
                title: "What is stored",
                items: [
                    "Your account: name, email address, your school, whether you're a student or teacher, your password (only as a secure hash, never readable), when you created the account and when you last used it.",
                    "Your classes: the classes you're in and when you joined; for teachers, the classes they teach and the email addresses of colleagues they invited.",
                    "Your work: start values, model rules, graphs, measured points, the photos and videos you add, and the work you hand in, with dates.",
                    "Signed-in browsers: when each one signed in and was last used, and which browser and system it is. Changing your password signs out all other browsers.",
                ],
                paragraphs: [
                    "Nothing else. PhysicsGo has no advertising, tracking or analytics and uses no services of other companies: fonts and all code come from PhysicsGo itself. It uses one cookie, to keep you signed in. Your language, theme and work that isn't saved yet are kept in your browser.",
                ],
            },
            {
                title: "Why",
                paragraphs: [
                    "Only so you can sign in, work on assignments and hand them in, and so your teachers can give assignments, follow your progress and look at your work. Your data isn't used for anything else and isn't shared outside your school.",
                ],
            },
            {
                title: "Who can see it",
                items: [
                    "You.",
                    "The teachers of your classes: your name, email address, work and hand-ins for the assignments in their classes.",
                    "The administrators of this PhysicsGo installation: your account details, to help with access problems.",
                ],
            },
            {
                title: "How long it's kept",
                items: [
                    "Signing in lasts 7 days at most, and ends after 8 hours without use.",
                    "A code to set a new password works for 24 hours.",
                    "A deleted class can be restored for 30 days; after that it's removed.",
                    "Accounts that haven't been used for 2 years are deleted, with all work that's only theirs.",
                    "When an account is deleted, its work, hand-ins, photos and videos are deleted with it. Backups of the database are removed after 14 days.",
                ],
            },
            {
                title: "What you can do",
                items: [
                    "See and download everything stored about you: Settings → Download my data.",
                    "Correct your name and email address on your profile.",
                    "Delete your account in Settings. A teacher can also delete a student's account from the class.",
                    "Ask your school about anything else, such as objecting or restricting use.",
                ],
            },
            {
                title: "Security",
                paragraphs: [
                    "Passwords and sign-ins are stored only as hashes. The connection is encrypted, sign-in attempts are limited, and only the people above can see your data.",
                ],
            },
        ],
    },
    nl: {
        title: "Privacyverklaring",
        intro: "Je school gebruikt PhysicsGo voor natuurkundelessen over modelleren. Hier lees je wat PhysicsGo over je bewaart, waarom, wie het kan zien, hoe lang het bewaard wordt en wat je ermee kunt.",
        sections: [
            {
                title: "Wie is verantwoordelijk",
                paragraphs: [
                    "Je school besluit PhysicsGo te gebruiken en is verantwoordelijk voor je gegevens (verwerkingsverantwoordelijke). Wie PhysicsGo voor je school beheert, verwerkt de gegevens alleen in opdracht van de school (verwerker), op basis van een verwerkersovereenkomst met de school.",
                    "Met vragen over je gegevens kun je terecht bij je docent of de functionaris gegevensbescherming van je school.",
                ],
            },
            {
                title: "Wat er bewaard wordt",
                items: [
                    "Je account: naam, e-mailadres, je school, of je leerling of docent bent, je wachtwoord (alleen als veilige hash, nooit leesbaar), wanneer je het account hebt gemaakt en wanneer je het voor het laatst gebruikte.",
                    "Je klassen: de klassen waarin je zit en sinds wanneer; bij docenten de klassen die ze lesgeven en de e-mailadressen van collega's die ze uitnodigden.",
                    "Je werk: startwaarden, modelregels, grafieken, gemeten punten, de foto's en video's die je toevoegt en het werk dat je inlevert, met data.",
                    "Ingelogde browsers: wanneer elke browser inlogde en voor het laatst gebruikt werd, en welke browser en welk systeem het is. Als je je wachtwoord wijzigt, worden alle andere browsers uitgelogd.",
                ],
                paragraphs: [
                    "Verder niets. PhysicsGo heeft geen advertenties, tracking of analytics en gebruikt geen diensten van andere bedrijven: lettertypen en alle code komen van PhysicsGo zelf. Er is één cookie, om je ingelogd te houden. Je taal, weergave en werk dat nog niet is opgeslagen, blijven in je browser.",
                ],
            },
            {
                title: "Waarom",
                paragraphs: [
                    "Alleen zodat je kunt inloggen, aan opdrachten kunt werken en ze kunt inleveren, en zodat je docenten opdrachten kunnen geven, je voortgang kunnen volgen en je werk kunnen bekijken. Je gegevens worden nergens anders voor gebruikt en niet buiten je school gedeeld.",
                ],
            },
            {
                title: "Wie het kan zien",
                items: [
                    "Jij.",
                    "De docenten van je klassen: je naam, e-mailadres, werk en inleveringen voor de opdrachten in hun klassen.",
                    "De beheerders van deze PhysicsGo-installatie: je accountgegevens, om te helpen bij problemen met inloggen.",
                ],
            },
            {
                title: "Hoe lang het bewaard wordt",
                items: [
                    "Inloggen duurt hooguit 7 dagen en stopt na 8 uur niet gebruiken.",
                    "Een code om een nieuw wachtwoord in te stellen werkt 24 uur.",
                    "Een verwijderde klas kan 30 dagen worden teruggezet; daarna wordt hij verwijderd.",
                    "Accounts die 2 jaar niet gebruikt zijn, worden verwijderd, met al het werk dat alleen van hen is.",
                    "Als een account wordt verwijderd, gaan het werk, de inleveringen, foto's en video's mee. Back-ups van de database worden na 14 dagen verwijderd.",
                ],
            },
            {
                title: "Wat je kunt doen",
                items: [
                    "Alles wat over je bewaard wordt bekijken en downloaden: Instellingen → Mijn gegevens downloaden.",
                    "Je naam en e-mailadres aanpassen op je profiel.",
                    "Je account verwijderen in Instellingen. Een docent kan ook het account van een leerling uit de klas verwijderen.",
                    "Voor al het andere, zoals bezwaar maken of gebruik laten beperken, kun je bij je school terecht.",
                ],
            },
            {
                title: "Beveiliging",
                paragraphs: [
                    "Wachtwoorden en inlogsessies worden alleen als hash bewaard. De verbinding is versleuteld, inlogpogingen zijn beperkt en alleen de mensen hierboven kunnen je gegevens zien.",
                ],
            },
        ],
    },
};
