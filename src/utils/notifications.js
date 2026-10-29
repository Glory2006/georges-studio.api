const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendNewReservationEmail(reservation, typePhotoName) {
  const recipient = process.env.PHOTOGRAPHER_EMAIL || process.env.EMAIL_USER;
  if (!recipient) {
    console.error('❌ Email photographe non configuré.');
    return;
  }

  try {
    const adminUrl = process.env.ADMIN_URL || '';
    const clientName = escapeHtml(reservation.nom_client);
    const clientEmail = escapeHtml(reservation.email);
    const clientPhone = escapeHtml(reservation.telephone);
    const date = escapeHtml(reservation.date_seance);
    const time = escapeHtml(`${reservation.heure_seance.substring(0, 5)}${reservation.heure_seance_end ? ` - ${reservation.heure_seance_end.substring(0, 5)}` : ''}`);
    const message = escapeHtml(reservation.message || 'Aucun message');
    const typeName = escapeHtml(typePhotoName || 'Séance photo');

    await transporter.sendMail({
      from: `"Georges Studio" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: `Nouvelle demande de réservation — ${reservation.nom_client}`,
      html: `
        <h2>Nouvelle demande de réservation</h2>
        <p>Une nouvelle demande vient d'être envoyée depuis le site Georges Studio.</p>
        <ul>
          <li><strong>Client :</strong> ${clientName}</li>
          <li><strong>Téléphone :</strong> ${clientPhone}</li>
          <li><strong>E-mail :</strong> ${clientEmail}</li>
          <li><strong>Type de séance :</strong> ${typeName}</li>
          <li><strong>Date :</strong> ${date}</li>
          <li><strong>Heure :</strong> ${time}</li>
          <li><strong>Message :</strong> ${message}</li>
        </ul>
        ${adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">Ouvrir l'administration</a></p>` : ''}
      `,
    });
    console.log('✅ Notification de réservation envoyée au photographe');
  } catch (err) {
    console.error('❌ Erreur notification réservation photographe :', err);
  }
}

async function sendAcceptanceEmail(reservation) {
  try {
    await transporter.sendMail({
      from: `"Georges Studio" <${process.env.EMAIL_USER}>`,
      to: reservation.email,
      subject: 'Votre réservation a été confirmée ! 🎉',
      html: `
        <h2>Bonjour ${reservation.nom_client},</h2>
        <p>Votre réservation chez <strong>Georges Studio</strong> a été acceptée !</p>
        <ul>
          <li><strong>Date :</strong> ${reservation.date_seance}</li>
          <li><strong>Heure :</strong> ${reservation.heure_seance.substring(0,5)}${reservation.heure_seance_end ? ' - ' + reservation.heure_seance_end.substring(0,5) : ''}</li>
        </ul>
        <p>Nous avons hâte de vous accueillir !</p>
        <p>— Georges Studio</p>
      `,
    });
    console.log('✅ Email envoyé à', reservation.email);
  } catch (err) {
    console.error('❌ Erreur envoi email :', err);
  }
}

module.exports = { sendAcceptanceEmail, sendNewReservationEmail };
