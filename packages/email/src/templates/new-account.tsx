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

export const NewAccountTemplate = ({
  name,
  email,
  temporaryPassword,
  workspaceName,
  loginUrl,
}: {
  name?: string;
  email?: string;
  temporaryPassword?: string;
  workspaceName?: string;
  loginUrl?: string;
}) => (
  <Html>
    <Head />
    <Preview>
      Tu cuenta para {workspaceName ?? "Metricas"} está lista
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
          {name ? `¡Bienvenido/a, ${name}!` : "Tu cuenta está lista"}
        </Heading>
        <Text
          style={{
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
            color: BRAND_NAVY,
          }}
        >
          Se creó una cuenta para ti
          {workspaceName ? ` en ${workspaceName}` : ""}. Usa estas
          credenciales para iniciar sesión — puedes cambiar tu contraseña una
          vez que ingreses.
        </Text>
        <Container
          style={{
            backgroundColor: "#f4f4f4",
            borderRadius: "0.375rem",
            padding: "1rem 1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <Text
            style={{
              fontSize: "0.875rem",
              margin: "0.25rem 0",
              color: BRAND_NAVY,
            }}
          >
            Correo: <strong>{email}</strong>
          </Text>
          <Text
            style={{
              fontSize: "0.875rem",
              margin: "0.25rem 0",
              color: BRAND_NAVY,
            }}
          >
            Contraseña temporal: <strong>{temporaryPassword}</strong>
          </Text>
        </Container>
        <Button
          target="_blank"
          href={loginUrl}
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
          Iniciar sesión
        </Button>
        <Text
          style={{
            marginBottom: "1rem",
            fontSize: "0.875rem",
            color: "#7e7e7e",
          }}
        >
          Si no esperabas esta cuenta, puedes ignorar este correo sin
          problema.
        </Text>
        {env("NEXT_PUBLIC_WHITE_LABEL_HIDE_POWERED_BY") !== "true" && (
          <>
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
          </>
        )}
      </Container>
    </Body>
  </Html>
);

export default NewAccountTemplate;
