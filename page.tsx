const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const bannerImage = `${supabaseUrl}/storage/v1/object/public/assets/LEYTE_Empowered_With_Purpose.jpg`;
const churchLogo = `${supabaseUrl}/storage/v1/object/public/assets/LOGO.png`;

export default function Page() {
  return (
    <main className="page">
      <div className="background-glow background-glow-top" aria-hidden="true" />
      <div className="background-glow background-glow-bottom" aria-hidden="true" />

      <section className="layout" aria-label="Event registration landing page">
        <article className="banner-column">
          <img
            src={bannerImage}
            alt="Empowered With Purpose event banner"
            className="banner-image"
          />
        </article>

        <article className="content-column">
          <div className="card">
            <p className="eyebrow">Joyful Sound Church - International</p>
            <h1>REGISTRATION FORM: LEYTE CHRISTIAN LEADERSHIP CONFERENCE 2026</h1>
            <h2>THEME: EMPOWERED WITH PURPOSE</h2>

            <blockquote>
              "He has saved us and called us to a holy life-not because of anything we have done but
              because of his own purpose and grace. This grace was given us in Christ Jesus before
              the beginning of time" - 2 TIMOTHY 1:9 -
            </blockquote>

            <div className="details">
              <p>For More details and Inquiries, Kindly contact the details below:</p>
              <p>Email address: gambepsalm50@gmail.com</p>
              <p>Mobile Num: 0947 480 3748 / 0917 303 2172</p>
              <p>Landline: 0325206977</p>
            </div>

            <div className="logo-wrap">
              <img src={churchLogo} alt="Joyful Sound Church logo" className="logo" />
            </div>

            <details className="register-panel">
              <summary className="register-button">Register Now</summary>
              <div className="register-options">
                <a href="#individual-registration" className="option-button">
                  Individual Registration
                </a>
                <a href="#bulk-registration" className="option-button option-button-secondary">
                  Bulk Registration
                </a>
              </div>
            </details>
          </div>
        </article>
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          padding: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 15% 20%, rgba(207, 103, 54, 0.4), transparent 35%),
            radial-gradient(circle at 85% 15%, rgba(255, 207, 122, 0.22), transparent 32%),
            linear-gradient(130deg, #331a1c 0%, #5c2f2d 28%, #1f2942 72%, #142032 100%);
          position: relative;
          overflow: hidden;
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        }

        .background-glow {
          position: absolute;
          width: 42vw;
          height: 42vw;
          filter: blur(70px);
          opacity: 0.18;
          pointer-events: none;
        }

        .background-glow-top {
          top: -10vw;
          left: -8vw;
          background: #f6b261;
        }

        .background-glow-bottom {
          right: -10vw;
          bottom: -16vw;
          background: #6989d6;
        }

        .layout {
          width: min(1200px, 100%);
          display: grid;
          grid-template-columns: minmax(320px, 44%) 1fr;
          gap: 22px;
          align-items: stretch;
          z-index: 1;
          animation: riseIn 700ms ease-out;
        }

        .banner-column,
        .content-column {
          border-radius: 24px;
          overflow: hidden;
          min-height: 580px;
          backdrop-filter: blur(2px);
        }

        .banner-column {
          border: 1px solid rgba(255, 235, 199, 0.35);
          box-shadow: 0 18px 45px rgba(3, 8, 20, 0.45);
        }

        .banner-image {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .content-column {
          border: 1px solid rgba(250, 218, 171, 0.25);
          background: linear-gradient(170deg, rgba(48, 23, 24, 0.84), rgba(20, 31, 56, 0.86));
          box-shadow: 0 16px 40px rgba(5, 13, 26, 0.45);
        }

        .card {
          height: 100%;
          padding: 30px;
          color: #f9f2e7;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .eyebrow {
          margin: 0;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #ffce96;
          font-size: 0.79rem;
          font-weight: 700;
        }

        h1 {
          margin: 0;
          color: #fff1d6;
          font-size: clamp(1.35rem, 2.2vw, 2rem);
          line-height: 1.2;
          letter-spacing: 0.02em;
        }

        h2 {
          margin: 0;
          color: #ffd394;
          font-size: clamp(1rem, 1.45vw, 1.2rem);
          letter-spacing: 0.07em;
        }

        blockquote {
          margin: 6px 0 0;
          padding: 12px 14px;
          border-left: 3px solid rgba(255, 203, 128, 0.8);
          background: rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          line-height: 1.45;
          color: #f9eede;
          font-size: 0.95rem;
        }

        .details {
          margin-top: 2px;
          padding: 14px;
          background: rgba(7, 12, 26, 0.27);
          border: 1px solid rgba(255, 210, 160, 0.23);
          border-radius: 12px;
        }

        .details p {
          margin: 0 0 8px;
          line-height: 1.45;
          color: #ffe8c8;
          font-size: 0.95rem;
        }

        .details p:last-child {
          margin-bottom: 0;
        }

        .logo-wrap {
          margin-top: 4px;
          display: flex;
          justify-content: center;
        }

        .logo {
          max-width: 110px;
          max-height: 110px;
          object-fit: contain;
          filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.45));
        }

        .register-panel {
          margin-top: auto;
        }

        .register-button {
          list-style: none;
          cursor: pointer;
          padding: 14px 18px;
          background: linear-gradient(110deg, #f2be73, #d58147);
          color: #2f1518;
          font-weight: 800;
          border-radius: 12px;
          text-align: center;
          letter-spacing: 0.04em;
          transition: transform 180ms ease, box-shadow 180ms ease;
          user-select: none;
          box-shadow: 0 10px 18px rgba(0, 0, 0, 0.28);
        }

        .register-button::-webkit-details-marker {
          display: none;
        }

        .register-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 22px rgba(0, 0, 0, 0.3);
        }

        .register-options {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .option-button {
          text-decoration: none;
          text-align: center;
          padding: 12px 10px;
          border-radius: 10px;
          font-weight: 700;
          color: #31191b;
          background: #f2dcc0;
          border: 1px solid rgba(255, 239, 212, 0.65);
          transition: transform 180ms ease, background 180ms ease;
        }

        .option-button:hover {
          transform: translateY(-1px);
          background: #ffe9cb;
        }

        .option-button-secondary {
          color: #efe5d6;
          background: rgba(38, 49, 76, 0.86);
          border-color: rgba(171, 190, 242, 0.5);
        }

        .option-button-secondary:hover {
          background: rgba(52, 66, 101, 0.94);
        }

        @keyframes riseIn {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 980px) {
          .layout {
            grid-template-columns: 1fr;
          }

          .banner-column,
          .content-column {
            min-height: 360px;
          }

          .banner-image {
            max-height: 620px;
          }
        }

        @media (max-width: 640px) {
          .page {
            padding: 14px;
          }

          .card {
            padding: 20px;
          }

          .register-options {
            grid-template-columns: 1fr;
          }

          .logo {
            max-width: 90px;
            max-height: 90px;
          }
        }
      `}</style>
    </main>
  );
}