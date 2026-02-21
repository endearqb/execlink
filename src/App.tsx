import { Toast } from "@base-ui/react";
import { HomePage } from "./pages/Home";

export default function App() {
  return (
    <Toast.Provider timeout={3500} limit={4}>
      <HomePage />
    </Toast.Provider>
  );
}
