import maybeParseInt from "@xtjs/lib/js/maybeParseInt";
import { Route } from "./main";

test("parsing works correctly", () => {
  const router = Route.new<unknown>();
  const userRouter = router.lit("user");
  userRouter.param("userId", maybeParseInt).end((parsed) => parsed.userId);
  userRouter
    .prefixedParam("userAlias", "@", String)
    .end((parsed) => parsed.userAlias);
  userRouter.param("username", String).end((parsed) => parsed.username);
  expect(router.parse(["user", "10"])).toEqual(10);
  expect(router.parse(["user", "@twtr"])).toEqual("twtr");
  expect(router.parse(["user", "un"])).toEqual("un");
});
