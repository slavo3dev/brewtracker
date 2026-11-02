export default function PasswordSuccessPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Password saved</h1>
      <p className="mt-4">
        Drivers and technicians: open the mobile app and sign in with your email
        and new password.
      </p>
      <a href="/login" className="mt-6 inline-block underline">
        Manager / CEO login
      </a>
    </div>
  );
}
