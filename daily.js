// ======================================================
// GAMEBOT — Script GitHub Actions (daily.js)
// Lance chaque soir via .github/workflows/gamebot.yml
// ======================================================
// Variables injectées via les secrets GitHub :
//   DISCORD_TOKEN       → process.env.DISCORD_TOKEN
//   QUESTION_CHANNEL_ID → process.env.QUESTION_CHANNEL_ID
//   RESULTS_CHANNEL_ID  → process.env.RESULTS_CHANNEL_ID
// ======================================================

const TOKEN              = process.env.DISCORD_TOKEN;
const QUESTION_CHANNEL   = process.env.QUESTION_CHANNEL_ID;
const RESULTS_CHANNEL    = process.env.RESULTS_CHANNEL_ID;

async function api(method, path, body = null) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

// Efface tous les messages d'un salon (par lots de 100, bulk delete si < 14 jours)
async function clearChannel(channelId) {
  let deleted = 0;
  while (true) {
    const messages = await api("GET", `/channels/${channelId}/messages?limit=100`);
    if (!messages || messages.length === 0) break;

    const ids = messages.map((m) => m.id);
    const cutoff = Date.now() - 13.5 * 24 * 60 * 60 * 1000; // 13,5 jours en ms

    // Sépare les messages récents (bulk delete) des anciens (delete un par un)
    const recent = ids.filter((id) => {
      const ms = Number(BigInt(id) >> 22n) + 1420070400000;
      return ms > cutoff;
    });
    const old = ids.filter((id) => !recent.includes(id));

    if (recent.length >= 2) {
      await api("POST", `/channels/${channelId}/messages/bulk-delete`, { messages: recent });
      deleted += recent.length;
    } else if (recent.length === 1) {
      await api("DELETE", `/channels/${channelId}/messages/${recent[0]}`);
      deleted++;
    }

    for (const id of old) {
      await api("DELETE", `/channels/${channelId}/messages/${id}`);
      deleted++;
      await sleep(300); // Respecte le rate-limit Discord
    }

    if (messages.length < 100) break;
    await sleep(1000);
  }
  console.log(`✓ ${deleted} message(s) supprimé(s) dans <#${channelId}>`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Formate la date en français
function dateAujourdhui() {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
}

async function main() {
  console.log("🎮 GameBot — lancement du script quotidien");

  // 1. Efface #disponibilités
  console.log("→ Nettoyage de #disponibilités...");
  await clearChannel(RESULTS_CHANNEL);

  // 2. Poste l'entête dans #disponibilités
  await api("POST", `/channels/${RESULTS_CHANNEL}/messages`, {
    embeds: [
      {
        title: "📋 Disponibilités du jour",
        description: `**${dateAujourdhui()}**\nLes joueurs disponibles ce soir apparaîtront ici.`,
        color: 0x5865f2,
      },
    ],
  });
  console.log("✓ Message d'entête posté dans #disponibilités");

  // 3. Poste le message avec bouton dans #on-joue-ce-soir
  await api("POST", `/channels/${QUESTION_CHANNEL}/messages`, {
    embeds: [
      {
        title: "🎮 On joue ce soir ?",
        description: `**${dateAujourdhui()}**\n\nClique sur le bouton si tu es dispo !`,
        color: 0x57f287,
        footer: { text: "Les disponibilités se réinitialisent chaque soir à minuit." },
      },
    ],
    components: [
      {
        type: 1, // ACTION_ROW
        components: [
          {
            type: 2, // BUTTON
            style: 3, // SUCCESS (vert)
            label: "Je joue ce soir ✓",
            custom_id: "je_joue",
            emoji: { name: "🎮" },
          },
        ],
      },
    ],
  });
  console.log("✓ Message de vote posté dans #on-joue-ce-soir");
  console.log("🎉 Script terminé avec succès !");
}

main().catch((err) => {
  console.error("❌ Erreur :", err.message);
  process.exit(1);
});
