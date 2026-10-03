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
                    "Your work: start values, model rules, graphs, measured points, the photos, videos, PDFs and web addresses you add, and the work you hand in, with dates and your teacher's feedback and marks on it.",
                    "Signed-in browsers: when each one signed in and was last used, and which browser and system it is. Changing your password signs out all other browsers.",
                    "Changes made by teachers and administrators: when a teacher or administrator deletes or changes an account, a class or a school (for example removes a student from a class or makes a password reset code), who did it, when, and the name and email address of the account it was about. Deleting your own account is recorded without your name.",
                ],
                paragraphs: [
                    "The server also keeps a technical log of requests (time, which part of PhysicsGo, whether it worked, how long it took), without names, email addresses, internet addresses or anything else about who made them.",
                    "Nothing else. PhysicsGo has no advertising, tracking or analytics and uses no services of other companies: fonts and all code come from PhysicsGo itself, except websites added to an assignment (below). It uses one cookie, to keep you signed in. Your language, theme and work that isn't saved yet are kept in your browser.",
                ],
            },
            {
                title: "Websites and videos in assignments",
                paragraphs: [
                    "You or your teacher can show a website in an assignment, such as a PhET simulation or a YouTube video. That website is loaded from its own server when the assignment is open: it sees your internet address and browser, and it can use cookies under its own privacy terms. PhysicsGo doesn't send it your name, email address or work.",
                    "The website runs in a closed-off frame, so it can't read or change anything in PhysicsGo. YouTube videos are shown through youtube-nocookie.com, which doesn't store cookies until you play the video, and Vimeo videos without tracking. You can always open the website in a new tab instead.",
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
                    "The administrators of this PhysicsGo installation: your account details, to help with access problems, and the record of changes made by teachers and administrators.",
                ],
            },
            {
                title: "How long it's kept",
                items: [
                    "Signing in lasts 7 days at most, and ends after 8 hours without use.",
                    "A code to set a new password works for 24 hours.",
                    "A deleted class can be restored for 30 days; after that it's removed.",
                    "The record of changes made by teachers and administrators is kept for 1 year.",
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
                    "Je werk: startwaarden, modelregels, grafieken, gemeten punten, de foto's, video's, pdf's en webadressen die je toevoegt en het werk dat je inlevert, met data en de feedback en cijfers van je docent daarop.",
                    "Ingelogde browsers: wanneer elke browser inlogde en voor het laatst gebruikt werd, en welke browser en welk systeem het is. Als je je wachtwoord wijzigt, worden alle andere browsers uitgelogd.",
                    "Wijzigingen door docenten en beheerders: als een docent of beheerder een account, klas of school verwijdert of wijzigt (bijvoorbeeld een leerling uit een klas haalt of een herstelcode voor een wachtwoord maakt), wie dat deed, wanneer, en de naam en het e-mailadres van het account waar het om ging. Als je je eigen account verwijdert, wordt dat zonder je naam vastgelegd.",
                ],
                paragraphs: [
                    "De server houdt ook een technisch logboek van verzoeken bij (tijd, welk deel van PhysicsGo, of het lukte, hoe lang het duurde), zonder namen, e-mailadressen, internetadressen of iets anders over wie ze deed.",
                    "Verder niets. PhysicsGo heeft geen advertenties, tracking of analytics en gebruikt geen diensten van andere bedrijven: lettertypen en alle code komen van PhysicsGo zelf, behalve websites die aan een opdracht zijn toegevoegd (hieronder). Er is één cookie, om je ingelogd te houden. Je taal, weergave en werk dat nog niet is opgeslagen, blijven in je browser.",
                ],
            },
            {
                title: "Websites en video's in opdrachten",
                paragraphs: [
                    "Jij of je docent kan een website in een opdracht tonen, zoals een PhET-simulatie of een YouTube-video. Die website wordt van zijn eigen server geladen als de opdracht open is: hij ziet je internetadres en browser, en kan cookies gebruiken volgens zijn eigen privacyvoorwaarden. PhysicsGo stuurt hem niet je naam, e-mailadres of werk.",
                    "De website draait in een afgesloten kader, zodat hij niets in PhysicsGo kan lezen of veranderen. YouTube-video's worden getoond via youtube-nocookie.com, dat pas cookies opslaat als je de video afspeelt, en Vimeo-video's zonder tracking. Je kunt de website altijd ook in een nieuw tabblad openen.",
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
                    "De beheerders van deze PhysicsGo-installatie: je accountgegevens, om te helpen bij problemen met inloggen, en het overzicht van wijzigingen door docenten en beheerders.",
                ],
            },
            {
                title: "Hoe lang het bewaard wordt",
                items: [
                    "Inloggen duurt hooguit 7 dagen en stopt na 8 uur niet gebruiken.",
                    "Een code om een nieuw wachtwoord in te stellen werkt 24 uur.",
                    "Een verwijderde klas kan 30 dagen worden teruggezet; daarna wordt hij verwijderd.",
                    "Het overzicht van wijzigingen door docenten en beheerders wordt 1 jaar bewaard.",
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
