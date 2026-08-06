import { createApp } from "vue"

import App from "./app/App.vue"
import { router } from "./app/router.js"
import "./styles/app.scss"

createApp(App).use(router).mount("#app")
