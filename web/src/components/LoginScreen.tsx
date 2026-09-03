import { t } from '../strings';

/**
 * Le seul élément actif est le lien vers /auth/login : la redirection OAuth
 * est un aller-retour navigateur, pas un appel fetch.
 */
export const LoginScreen = () => (
  <div className="centered">
    <h1>{t('login.title')}</h1>
    <p className="muted">{t('login.intro')}</p>
    <a className="primary" href="/auth/login">
      {t('login.action')}
    </a>
  </div>
);
