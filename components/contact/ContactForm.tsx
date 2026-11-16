"use client";

import { useState, type FormEvent } from "react";
import { SUPPORT_EMAIL } from "@/lib/support-email";

export { SUPPORT_EMAIL };

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    if (!trimmedName || !trimmedEmail || !trimmedMessage) {
      setError("Please fill in your name, email, and message.");
      return;
    }

    const subject = encodeURIComponent(`UpSycle Market message from ${trimmedName}`);
    const body = encodeURIComponent(
      `Name: ${trimmedName}\nEmail: ${trimmedEmail}\n\n${trimmedMessage}`,
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="border border-[var(--border)] bg-[var(--charcoal)] p-6 md:p-8">
      {error && <div className="form-error mb-4">{error}</div>}

      <div className="form-group">
        <label className="form-label" htmlFor="contact-name">
          Name
        </label>
        <input
          id="contact-name"
          className="form-input"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="contact-email">
          Email
        </label>
        <input
          id="contact-email"
          className="form-input"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          className="form-input"
          name="message"
          rows={6}
          required
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>

      <button type="submit" className="btn-primary">
        Email this message
      </button>
      <p className="mt-4 text-[0.78rem] font-light leading-relaxed text-[var(--muted)]">
        This opens your email app with the message filled in. The website does not send it for you.
      </p>
    </form>
  );
}
