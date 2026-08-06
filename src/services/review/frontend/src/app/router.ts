import { createRouter, createWebHistory } from "vue-router"

import PostDetailPage from "../pages/PostDetailPage.vue"
import WeekViewPage from "../pages/WeekViewPage.vue"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      component: WeekViewPage,
      path: "/"
    },
    {
      component: WeekViewPage,
      path: "/weeks/:weekDate"
    },
    {
      component: PostDetailPage,
      path: "/posts/:postId"
    }
  ]
})
