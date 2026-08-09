import { Body } from "@react-email/body";
import { Button } from "@react-email/button";
import { Container } from "@react-email/container";
import { Head } from "@react-email/head";
import { Heading } from "@react-email/heading";
import { Hr } from "@react-email/hr";
import { Html } from "@react-email/html";
import { Link } from "@react-email/link";
import { Preview } from "@react-email/preview";
import { Text } from "@react-email/text";
import { env } from "next-runtime-env";
import * as React from "react";

import { BODY_FONT_FAMILY, BRAND_NAVY, BRAND_RED } from "./colors";
import { EmailLogo } from "./EmailLogo";

export const CardStatusChangedTemplate = ({
  actorName,
  boardName,
  cardTitle,
  fromListName,
  toListName,
  cardUrl,
}: {
  actorName: string;
  boardName: string;
  cardTitle: string;
  fromListName: string;
  toListName: string;
  cardUrl: string;
}) => (
  <Html>
    <Head />
    <Preview>
      {cardTitle} se movió a {toListName}
    </Preview>
    <Body style={{ backgroundColor: "white" }}>
      <Container
        style={{
          fontFamily: BODY_FONT_FAMILY,
          margin: "auto",
          paddingLeft: "0.75rem",
          paddingRight: "0.75rem",
        }}
      >
        {env("NEXT_PUBLIC_WHITE_LABEL_HIDE_POWERED_BY") !== "true" && (
          <EmailLogo />
        )}
        <Heading
          style={{ fontSize: "24px", fontWeight: "bold", color: BRAND_NAVY }}
        >
          {cardTitle} se movió a {toListName}
        </Heading>
        <Text
          style={{
            fontSize: "0.875rem",
            marginBottom: "2rem",
            color: BRAND_NAVY,
          }}
        >
          <strong>{actorName}</strong> movió la tarjeta{" "}
          <strong>{cardTitle}</strong> de <strong>{fromListName}</strong> a{" "}
          <strong>{toListName}</strong> en el tablero{" "}
          <strong>{boardName}</strong>.
        </Text>
        <Button
          target="_blank"
          href={cardUrl}
          style={{
            marginBottom: "2rem",
            borderRadius: "0.375rem",
            backgroundColor: BRAND_RED,
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
            fontSize: "0.875rem",
            fontWeight: "500",
            lineHeight: "1",
            color: "white",
          }}
        >
          Ver tarjeta
        </Button>
        <Hr
          style={{
            marginTop: "2.5rem",
            marginBottom: "2rem",
            borderWidth: "1px",
          }}
        />
        <Text style={{ color: "#7e7e7e" }}>
          <Link
            href={env("NEXT_PUBLIC_BASE_URL")}
            target="_blank"
            style={{ color: "#7e7e7e", textDecoration: "underline" }}
          >
            Metricas
          </Link>
          , la alternativa open source a Trello.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default CardStatusChangedTemplate;
